import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Linking,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import { track } from '@vercel/analytics';
import {
  fetchAgencies,
  fetchAgencyDetail,
  fetchCivicFeed,
  AgencyPortalSummaryItem,
  AgencyPortalDetail,
  AgencyDirectorySummary,
  AgencyStateCount,
  AgencySortKey,
  AgencyAuditFilter,
  CivicFeedResponse,
} from '../services/api';

interface Props {
  navigate: (path: string) => void;
}

const SORT_OPTIONS: { key: AgencySortKey; label: string }[] = [
  { key: 'retention', label: '⏱️ Longest Retention' },
  { key: 'sharing', label: '🔗 Most Outside Agencies' },
  { key: 'vehicles', label: '📸 Most 30d Captures' },
  { key: 'cameras', label: '📡 Largest Fleet' },
  { key: 'searches', label: '🔎 Most 30d Searches' },
  { key: 'unaudited', label: '🙈 Hiding Logs First' },
];

const AUDIT_OPTIONS: { key: AgencyAuditFilter; label: string }[] = [
  { key: 'all', label: 'All Portals' },
  { key: 'unaudited', label: 'Hiding Search Logs' },
  { key: 'audited', label: 'Public Audit Published' },
];

function formatCompact(n?: number | null): string {
  if (n === null || n === undefined) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 100_000) return `${Math.round(n / 1_000)}K`;
  return n.toLocaleString();
}

const STATE_RECORDS_LAWS: Record<string, string> = {
  CA: 'the California Public Records Act (Cal. Gov. Code § 7920.000 et seq.)',
  WA: 'the Washington Public Records Act (RCW 42.56)',
  OR: 'Oregon Public Records Law (ORS 192.311 et seq.)',
  TX: 'the Texas Public Information Act (Tex. Gov. Code Ch. 552)',
  IL: 'the Illinois Freedom of Information Act (5 ILCS 140)',
  FL: 'Florida Public Records Law (Fla. Stat. Ch. 119)',
  NY: 'the New York Freedom of Information Law (N.Y. Pub. Off. Law §§ 84–90)',
  CO: 'the Colorado Open Records Act (C.R.S. § 24-72-201 et seq.)',
  VA: 'the Virginia Freedom of Information Act (Va. Code § 2.2-3700 et seq.)',
  MI: 'the Michigan Freedom of Information Act (MCL 15.231 et seq.)',
  OH: 'the Ohio Public Records Act (R.C. § 149.43)',
  NC: 'the North Carolina Public Records Law (N.C.G.S. § 132-1 et seq.)',
  GA: 'the Georgia Open Records Act (O.C.G.A. § 50-18-70 et seq.)',
  AZ: 'Arizona Public Records Law (A.R.S. § 39-121 et seq.)',
};

function buildFoiaRequestText(detail: AgencyPortalDetail): string {
  const law = STATE_RECORDS_LAWS[detail.state] || `${detail.state} state public records law`;
  const bullets: string[] = [
    `1. All active contracts, purchase orders, invoices, and addenda with Flock Group Inc. (Flock Safety) or any other ALPR vendor, including total annual cost and renewal/termination dates.`,
    `2. All written ALPR usage, retention (${detail.data_retention ? `currently listed at ${detail.data_retention} days` : 'retention schedule'}), and auto-purge policies currently in force.`,
    `3. ${(detail.organization_count || 0) > 0 ? `Complete list of all ${detail.organization_count} outside law enforcement agencies or entities granted lookup access to ${detail.agency_name} ALPR data, plus executed inter-agency data-sharing MOUs.` : `All inter-agency data-sharing agreements, hotlist-sharing MOUs, and federal/out-of-state access logs.`}`,
  ];
  if (detail.public_search_audit === false) {
    bullets.push(
      `4. Electronic ALPR search audit logs (in CSV/XLSX format with personally identifying officer details redacted as required) showing external agency lookups, case/reason codes, and query volume — noting your public transparency portal currently omits public search audits.`
    );
  } else {
    bullets.push(
      `4. Cumulative 12-month ALPR query audit summary including out-of-state and federal agency search counts.`
    );
  }

  return [
    `To: Public Records Officer / Custodian of Records, ${detail.agency_name}`,
    `Subject: Public Records Request — Automated License Plate Reader (ALPR) Contracts, Sharing & Audit Logs`,
    ``,
    `Pursuant to ${law}, I hereby request electronic copies of the following public records maintained by ${detail.agency_name}:`,
    ``,
    ...bullets,
    ``,
    `Please provide responsive records electronically in native format (PDF/CSV) to avoid unnecessary copying fees. If any portion is withheld, please cite the specific statutory exemption and release all reasonably segregable non-exempt portions.`,
    ``,
    `Thank you for your prompt attention within the statutory response period.`,
  ].join('\n');
}

function readUrlParams(): {
  tab: 'portals' | 'civic';
  state: string;
  q: string;
  sort: AgencySortKey;
  audit: AgencyAuditFilter;
  agency: string;
} {
  if (typeof window === 'undefined') {
    return { tab: 'portals', state: '', q: '', sort: 'retention', audit: 'all', agency: '' };
  }
  const sp = new URLSearchParams(window.location.search);
  const validSorts: AgencySortKey[] = [
    'cameras',
    'retention',
    'sharing',
    'receiving',
    'vehicles',
    'searches',
    'unaudited',
  ];
  const validAudits: AgencyAuditFilter[] = ['all', 'unaudited', 'audited'];
  const rawSort = (sp.get('sort') || 'retention') as AgencySortKey;
  const rawAudit = (sp.get('audit') || 'all') as AgencyAuditFilter;
  return {
    tab: sp.get('tab') === 'civic' ? 'civic' : 'portals',
    state: (sp.get('state') || '').toUpperCase().slice(0, 2),
    q: sp.get('q') || '',
    sort: validSorts.includes(rawSort) ? rawSort : 'retention',
    audit: validAudits.includes(rawAudit) ? rawAudit : 'all',
    agency: sp.get('agency') || '',
  };
}

export function PortalsPage({ navigate }: Props) {
  const initial = useMemo(() => readUrlParams(), []);

  const [activeTab, setActiveTab] = useState<'portals' | 'civic'>(initial.tab);
  const [stateFilter, setStateFilter] = useState<string>(initial.state);
  const [searchText, setSearchText] = useState<string>(initial.q);
  const [debouncedQuery, setDebouncedQuery] = useState<string>(initial.q);
  const [sortBy, setSortBy] = useState<AgencySortKey>(initial.sort);
  const [auditFilter, setAuditFilter] = useState<AgencyAuditFilter>(initial.audit);

  const [agencies, setAgencies] = useState<AgencyPortalSummaryItem[]>([]);
  const [summary, setSummary] = useState<AgencyDirectorySummary | null>(null);
  const [statesList, setStatesList] = useState<AgencyStateCount[]>([]);
  const [totalMatching, setTotalMatching] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [civicFeed, setCivicFeed] = useState<CivicFeedResponse | null>(null);
  const [civicLoading, setCivicLoading] = useState<boolean>(false);
  const [civicError, setCivicError] = useState<string | null>(null);

  const [selectedSlug, setSelectedSlug] = useState<string>(initial.agency);
  const [detail, setDetail] = useState<AgencyPortalDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [partnerFilter, setPartnerFilter] = useState<string>('');
  const [partnerTab, setPartnerTab] = useState<'shared' | 'received'>('shared');
  const [showFoiaDraft, setShowFoiaDraft] = useState<boolean>(false);
  const [copiedShareKey, setCopiedShareKey] = useState<string | null>(null);

  const PAGE_SIZE = 75;

  // Debounce search text
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchText.trim()), 260);
    return () => clearTimeout(t);
  }, [searchText]);

  // Keep shareable URL synced cleanly on /portals
  useEffect(() => {
    if (typeof window === 'undefined' || window.location.pathname !== '/portals') return;
    const sp = new URLSearchParams();
    if (activeTab === 'civic') sp.set('tab', 'civic');
    if (stateFilter) sp.set('state', stateFilter);
    if (debouncedQuery) sp.set('q', debouncedQuery);
    if (sortBy !== 'retention') sp.set('sort', sortBy);
    if (auditFilter !== 'all') sp.set('audit', auditFilter);
    if (selectedSlug) sp.set('agency', selectedSlug);
    const qs = sp.toString();
    const nextUrl = qs ? `/portals?${qs}` : '/portals';
    window.history.replaceState(null, '', nextUrl);
  }, [activeTab, stateFilter, debouncedQuery, sortBy, auditFilter, selectedSlug]);

  // Load civic legal actions & contract feed when Civic tab is open
  const loadCivic = useCallback(async () => {
    setCivicLoading(true);
    setCivicError(null);
    try {
      const res = await fetchCivicFeed({ state: stateFilter || undefined });
      setCivicFeed(res);
    } catch (e: any) {
      setCivicError(e?.message || 'Unable to load civic enforcement & contract records.');
    } finally {
      setCivicLoading(false);
    }
  }, [stateFilter]);

  useEffect(() => {
    if (activeTab === 'civic') {
      loadCivic();
    }
  }, [activeTab, loadCivic]);

  // Fetch initial/filtered directory
  const loadDirectory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAgencies({
        state: stateFilter || undefined,
        q: debouncedQuery || undefined,
        sort: sortBy,
        audit: auditFilter,
        limit: PAGE_SIZE,
        offset: 0,
        includeStates: statesList.length === 0,
      });
      setAgencies(res.agencies || []);
      setTotalMatching(res.total ?? res.agencies?.length ?? 0);
      if (res.summary) setSummary(res.summary);
      if (res.states && res.states.length > 0) setStatesList(res.states);
    } catch (e: any) {
      setError(e?.message || 'Unable to load agency transparency portals right now.');
    } finally {
      setLoading(false);
    }
  }, [stateFilter, debouncedQuery, sortBy, auditFilter, statesList.length]);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  const handleLoadMore = async () => {
    if (loadingMore || agencies.length >= totalMatching) return;
    setLoadingMore(true);
    try {
      const res = await fetchAgencies({
        state: stateFilter || undefined,
        q: debouncedQuery || undefined,
        sort: sortBy,
        audit: auditFilter,
        limit: PAGE_SIZE,
        offset: agencies.length,
      });
      setAgencies(prev => [...prev, ...(res.agencies || [])]);
    } catch {
      // Keep already loaded rows visible
    } finally {
      setLoadingMore(false);
    }
  };

  // Load agency dossier whenever selectedSlug is non-empty
  useEffect(() => {
    if (!selectedSlug) {
      setDetail(null);
      return;
    }
    let active = true;
    setDetailLoading(true);
    setPartnerFilter('');
    setPartnerTab('shared');
    setShowFoiaDraft(false);
    fetchAgencyDetail(selectedSlug).then(d => {
      if (!active) return;
      setDetail(d);
      setDetailLoading(false);
      if (d) {
        try {
          track('portal_dossier_opened', { slug: d.slug, state: d.state });
        } catch {}
      }
    });
    return () => {
      active = false;
    };
  }, [selectedSlug]);

  const copyShareUrl = (key: string, customSlug?: string) => {
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://fourthroute.org';
      let url = `${origin}/portals`;
      if (customSlug) {
        url = `${origin}/portals?agency=${encodeURIComponent(customSlug)}`;
      } else if (typeof window !== 'undefined') {
        url = `${origin}${window.location.pathname}${window.location.search}`;
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(url);
      }
      track('portal_share_copied', { scope: customSlug ? 'agency' : 'leaderboard', slug: customSlug || 'filtered' });
      setCopiedShareKey(key);
      setTimeout(() => setCopiedShareKey(prev => (prev === key ? null : prev)), 2200);
    } catch {}
  };

  const activePartnersList = useMemo(() => {
    if (!detail) return [];
    const raw =
      partnerTab === 'shared'
        ? detail.organizations_shared_with
        : detail.organizations_received_from;
    const clean = Array.isArray(raw) ? raw.filter(Boolean) : [];
    const q = partnerFilter.trim().toLowerCase();
    return q ? clean.filter(name => name.toLowerCase().includes(q)) : clean;
  }, [detail, partnerTab, partnerFilter]);

  return (
    <View style={styles.root}>
      {/* Sticky Top Nav */}
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => navigate('/')} style={styles.navBack}>
          <Text style={styles.navBackText}>← Map</Text>
        </TouchableOpacity>
        <View style={styles.navLinks}>
          <TouchableOpacity onPress={() => navigate('/lockdown')}>
            <Text style={[styles.navLink, { color: '#4ade80', fontWeight: '700' }]}>🛡️ Lockdown</Text>
          </TouchableOpacity>
          <Text style={styles.navDot}>·</Text>
          <TouchableOpacity onPress={() => navigate('/about')}>
            <Text style={styles.navLink}>About</Text>
          </TouchableOpacity>
          <Text style={styles.navDot}>·</Text>
          <TouchableOpacity onPress={() => navigate('/privacy')}>
            <Text style={styles.navLink}>Privacy</Text>
          </TouchableOpacity>
          <Text style={styles.navDot}>·</Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://instagram.com/fourthroute')}>
            <Text style={styles.navLink}>@fourthroute ↗</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.statusPill}>
            <Text style={styles.statusPillText}>
              📊 AGENCY ACCOUNTABILITY HUB · EYES ON FLOCK (CC BY-SA 4.0)
            </Text>
          </View>
          <Text style={styles.heroTitle}>Search Police &amp; Sheriff Transparency Portals</Text>
          <Text style={styles.heroSub}>
            Audit retention periods, 30-day capture volumes, external law enforcement sharing networks,
            verified lawsuits, council terminations, and municipal contract spend.
          </Text>
        </View>

        {/* Hub Mode Switcher */}
        <View style={styles.modeTabRow}>
          <TouchableOpacity
            style={[styles.modeTabBtn, activeTab === 'portals' && styles.modeTabBtnActive]}
            onPress={() => setActiveTab('portals')}
          >
            <Text style={[styles.modeTabText, activeTab === 'portals' && styles.modeTabTextActive]}>
              🔍 Transparency Portals
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeTabBtn, activeTab === 'civic' && styles.modeTabBtnActive]}
            onPress={() => {
              setActiveTab('civic');
              try {
                track('civic_feed_opened');
              } catch {}
            }}
          >
            <Text style={[styles.modeTabText, activeTab === 'civic' && styles.modeTabTextActive]}>
              ⚖️ Legal Actions &amp; Contracts
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'civic' ? (
          <View style={{ gap: 14 }}>
            {/* State Quick Filters for Civic Feed */}
            <View style={styles.controlsCard}>
              <Text style={styles.controlLabel}>FILTER BY JURISDICTION</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pillRow}
              >
                {['', 'CA', 'WA', 'OR', 'CO', 'TX', 'IL', 'KS', 'MI', 'UT'].map(st => {
                  const active = stateFilter === st;
                  return (
                    <TouchableOpacity
                      key={st || 'ALL'}
                      style={[styles.filterPill, active && styles.filterPillActive]}
                      onPress={() => setStateFilter(st)}
                    >
                      <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                        {st || 'All Tracked States'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {civicLoading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color="#4ade80" />
                <Text style={styles.loadingText}>Loading legal &amp; contract records…</Text>
              </View>
            ) : civicError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠️ {civicError}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={loadCivic}>
                  <Text style={styles.retryBtnText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : civicFeed ? (
              <>
                <View style={styles.kpiGrid}>
                  <View style={styles.kpiCard}>
                    <Text style={styles.kpiValue}>{civicFeed.summary.total_actions}</Text>
                    <Text style={styles.kpiLabel}>Laws &amp; Enforcement Actions</Text>
                  </View>
                  <View style={styles.kpiCard}>
                    <Text style={[styles.kpiValue, { color: '#fbbf24' }]}>
                      {civicFeed.summary.terminated_or_switched}
                    </Text>
                    <Text style={styles.kpiLabel}>Cancelled / Switched Cities</Text>
                  </View>
                  <View style={styles.kpiCard}>
                    <Text style={[styles.kpiValue, { color: '#60a5fa' }]}>
                      {civicFeed.summary.state_laws_count}
                    </Text>
                    <Text style={styles.kpiLabel}>Statewide Statutory Caps</Text>
                  </View>
                  <View style={[styles.kpiCard, { borderColor: '#ef444444' }]}>
                    <Text style={[styles.kpiValue, { color: '#f87171' }]}>
                      {civicFeed.summary.incidents_count ?? 0}
                    </Text>
                    <Text style={styles.kpiLabel}>Documented Misuse Cases</Text>
                  </View>
                  <View style={[styles.kpiCard, { borderColor: '#4ade8044' }]}>
                    <Text style={[styles.kpiValue, { color: '#4ade80' }]}>
                      {civicFeed.summary.federal_awards_count ?? 0}
                    </Text>
                    <Text style={styles.kpiLabel}>Federal Awards (USASpending)</Text>
                  </View>
                </View>

                {civicFeed.contracts.length > 0 && (
                  <View style={{ gap: 10 }}>
                    <Text style={styles.civicSectionTitle}>MUNICIPAL CONTRACT SPEND &amp; TERMINATIONS</Text>
                    {civicFeed.contracts.map(c => {
                      const isStopped = c.status === 'terminated' || c.status === 'switched' || c.status === 'expired';
                      return (
                        <View key={c.contract_key} style={styles.agencyCard}>
                          <View style={styles.cardTopRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.agencyName}>
                                {c.city}, {c.state} · {c.vendor}
                              </Text>
                              <Text style={styles.agencyLoc}>
                                {c.contract_value_usd ? `$${c.contract_value_usd.toLocaleString()} contract` : 'Baseline per-camera deployment'}
                                {c.annual_cost_usd ? ` · ~$${c.annual_cost_usd.toLocaleString()}/yr` : ''}
                                {c.camera_count ? ` · ${c.camera_count} cameras` : ''}
                              </Text>
                            </View>
                            <View
                              style={[
                                styles.auditBadge,
                                isStopped ? styles.auditBadgeOk : styles.auditBadgeWarn,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.auditBadgeText,
                                  isStopped ? { color: '#4ade80' } : { color: '#fbbf24' },
                                ]}
                              >
                                {c.status.toUpperCase()}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.policyText}>{c.notes}</Text>
                          <View style={styles.civicCardActions}>
                            {c.agency_slug && (
                              <TouchableOpacity
                                style={styles.civicActionLink}
                                onPress={() => setSelectedSlug(c.agency_slug!)}
                              >
                                <Text style={styles.civicActionLinkText}>Inspect Portal Dossier →</Text>
                              </TouchableOpacity>
                            )}
                            <TouchableOpacity onPress={() => Linking.openURL(c.source_url)}>
                              <Text style={styles.sourceCiteText}>Source: {c.source_label} ↗</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}

                {civicFeed.actions.length > 0 && (
                  <View style={{ gap: 10 }}>
                    <Text style={styles.civicSectionTitle}>ENFORCEMENT ACTIONS, LAWSUITS &amp; STATE STATUTES</Text>
                    {civicFeed.actions.map(act => {
                      const isStatute = act.action_type === 'statute_cap';
                      return (
                        <View key={act.action_key} style={styles.agencyCard}>
                          <View style={styles.cardTopRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.agencyName}>{act.headline}</Text>
                              <Text style={styles.agencyLoc}>
                                {act.jurisdiction_name} · {act.state} · {act.action_date}
                              </Text>
                            </View>
                            <View
                              style={[
                                styles.auditBadge,
                                isStatute ? styles.statuteBadge : styles.alertBadge,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.auditBadgeText,
                                  { color: isStatute ? '#93c5fd' : '#fca5a5' },
                                ]}
                              >
                                {act.statute_or_vote || act.action_type.toUpperCase()}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.policyText}>{act.summary}</Text>
                          <View style={styles.civicCardActions}>
                            {act.agency_slug && (
                              <TouchableOpacity
                                style={styles.civicActionLink}
                                onPress={() => setSelectedSlug(act.agency_slug!)}
                              >
                                <Text style={styles.civicActionLinkText}>Open Agency Dossier →</Text>
                              </TouchableOpacity>
                            )}
                            <TouchableOpacity onPress={() => Linking.openURL(act.source_url)}>
                              <Text style={styles.sourceCiteText}>Source: {act.source_label} ↗</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
                {civicFeed.incidents && civicFeed.incidents.length > 0 && (
                  <View style={{ gap: 10 }}>
                    <Text style={styles.civicSectionTitle}>DOCUMENTED MISUSE &amp; AUDIT VIOLATIONS</Text>
                    {civicFeed.incidents.map(inc => (
                      <View key={inc.incident_key} style={[styles.agencyCard, { borderColor: '#ef444444' }]}>
                        <View style={styles.cardTopRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.agencyName}>{inc.headline}</Text>
                            <Text style={styles.agencyLoc}>
                              {inc.jurisdiction_name} · {inc.state} · {inc.incident_date}
                            </Text>
                          </View>
                          <View style={[styles.auditBadge, styles.alertBadge]}>
                            <Text style={[styles.auditBadgeText, { color: '#fca5a5' }]}>
                              {inc.category.replace(/_/g, ' ').toUpperCase()}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.policyText}>{inc.summary}</Text>
                        <View style={styles.civicCardActions}>
                          {inc.agency_slug && (
                            <TouchableOpacity
                              style={styles.civicActionLink}
                              onPress={() => setSelectedSlug(inc.agency_slug!)}
                            >
                              <Text style={styles.civicActionLinkText}>Open Agency Dossier →</Text>
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity onPress={() => Linking.openURL(inc.source_url)}>
                            <Text style={styles.sourceCiteText}>Source: {inc.source_label} ↗</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {civicFeed.federal_awards && civicFeed.federal_awards.length > 0 && (
                  <View style={{ gap: 10 }}>
                    <Text style={styles.civicSectionTitle}>FEDERAL ALPR CONTRACTS &amp; JAG GRANTS (USASPENDING.GOV)</Text>
                    {civicFeed.federal_awards.map(aw => (
                      <View key={aw.award_id} style={styles.agencyCard}>
                        <View style={styles.cardTopRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.agencyName}>
                              {aw.recipient_name} · ${Math.round(aw.amount_usd).toLocaleString()}
                            </Text>
                            <Text style={styles.agencyLoc}>
                              {aw.awarding_agency} {aw.state ? `· ${aw.state}` : ''} {aw.start_date ? `· ${aw.start_date}` : ''}
                            </Text>
                          </View>
                          <View style={[styles.auditBadge, styles.auditBadgeOk]}>
                            <Text style={[styles.auditBadgeText, { color: '#4ade80' }]}>
                              FEDERAL {aw.award_type.toUpperCase()}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.policyText}>{aw.description}</Text>
                        <View style={styles.civicCardActions}>
                          {aw.agency_slug && (
                            <TouchableOpacity
                              style={styles.civicActionLink}
                              onPress={() => setSelectedSlug(aw.agency_slug!)}
                            >
                              <Text style={styles.civicActionLinkText}>Inspect Portal Dossier →</Text>
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity onPress={() => Linking.openURL(aw.source_url)}>
                            <Text style={styles.sourceCiteText}>USASpending Award #{aw.award_id} ↗</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </>
            ) : null}
          </View>
        ) : (
          <>
        {/* National / Filtered KPI Strip */}
        {summary && (
          <View style={styles.kpiGrid}>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>{summary.total_matching.toLocaleString()}</Text>
              <Text style={styles.kpiLabel}>
                Portals ({summary.states_count} {summary.states_count === 1 ? 'State' : 'States'})
              </Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>{summary.total_cameras.toLocaleString()}</Text>
              <Text style={styles.kpiLabel}>Reported Cameras</Text>
            </View>
            <View style={[styles.kpiCard, styles.kpiCardWarn]}>
              <Text style={[styles.kpiValue, { color: '#fbbf24' }]}>
                {summary.unaudited_count.toLocaleString()}
              </Text>
              <Text style={styles.kpiLabel}>Hiding Search Logs</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={[styles.kpiValue, { color: '#4ade80' }]}>
                {summary.max_retention_days ? `${summary.max_retention_days}d` : '—'}
              </Text>
              <Text style={styles.kpiLabel}>
                Max Retention · {formatCompact(summary.max_sharing_partners)} max shares
              </Text>
            </View>
          </View>
        )}

        {/* Search + Copy Share Link Row */}
        <View style={styles.controlsCard}>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search city, county, or department (e.g. Oakland, San Diego, Mesa)..."
              placeholderTextColor="#64748b"
              value={searchText}
              onChangeText={setSearchText}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchText.length > 0 && (
              <TouchableOpacity style={styles.clearBtn} onPress={() => setSearchText('')}>
                <Text style={styles.clearBtnText}>✕</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.shareFilterBtn}
              onPress={() => copyShareUrl('toolbar')}
            >
              <Text style={styles.shareFilterBtnText}>
                {copiedShareKey === 'toolbar' ? '✓ Link Copied' : '🔗 Share View'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* State Pills */}
          {statesList.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pillRow}
            >
              <TouchableOpacity
                style={[styles.filterPill, !stateFilter && styles.filterPillActive]}
                onPress={() => setStateFilter('')}
              >
                <Text style={[styles.filterPillText, !stateFilter && styles.filterPillTextActive]}>
                  All States
                </Text>
              </TouchableOpacity>
              {statesList.map(st => {
                const active = stateFilter === st.state;
                return (
                  <TouchableOpacity
                    key={st.state}
                    style={[styles.filterPill, active && styles.filterPillActive]}
                    onPress={() => setStateFilter(active ? '' : st.state)}
                  >
                    <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                      {st.state} ({st.count})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* Sort Leaderboard Tabs */}
          <Text style={styles.controlLabel}>RANK LEADERBOARD BY</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillRow}
          >
            {SORT_OPTIONS.map(opt => {
              const active = sortBy === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.sortPill, active && styles.sortPillActive]}
                  onPress={() => {
                    setSortBy(opt.key);
                    try {
                      track('portals_sort', { sort: opt.key });
                    } catch {}
                  }}
                >
                  <Text style={[styles.sortPillText, active && styles.sortPillTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Search Audit Filter */}
          <View style={styles.auditRow}>
            {AUDIT_OPTIONS.map(opt => {
              const active = auditFilter === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.auditPill, active && styles.auditPillActive]}
                  onPress={() => setAuditFilter(opt.key)}
                >
                  <Text style={[styles.auditPillText, active && styles.auditPillTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Results Count */}
        <View style={styles.resultsBar}>
          <Text style={styles.resultsText}>
            Showing {agencies.length.toLocaleString()} of {totalMatching.toLocaleString()} matching portals
            {stateFilter ? ` in ${stateFilter}` : ''}
          </Text>
          {(stateFilter || debouncedQuery || auditFilter !== 'all') && (
            <TouchableOpacity
              onPress={() => {
                setStateFilter('');
                setSearchText('');
                setAuditFilter('all');
              }}
            >
              <Text style={styles.resetFiltersText}>Reset Filters</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Error / Loading / List */}
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#4ade80" />
            <Text style={styles.loadingText}>Loading agency transparency portals…</Text>
          </View>
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={loadDirectory}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : agencies.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No verified agency portals matched your filter</Text>
            <Text style={styles.emptySub}>
              Try clearing the search query or switching back to All States.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {agencies.map((ag, idx) => {
              const rank = idx + 1;
              const retention = ag.data_retention;
              const retentionColor =
                retention && retention >= 365
                  ? '#f87171'
                  : retention && retention >= 90
                    ? '#fbbf24'
                    : '#e2e8f0';
              const isUnaudited = ag.public_search_audit === false;
              const locationLine = [ag.city, ag.county && ag.county !== ag.city ? `${ag.county} County` : null, ag.state]
                .filter(Boolean)
                .join(' · ');

              return (
                <TouchableOpacity
                  key={ag.slug}
                  style={styles.agencyCard}
                  activeOpacity={0.85}
                  onPress={() => setSelectedSlug(ag.slug)}
                >
                  <View style={styles.cardTopRow}>
                    <View style={styles.cardTitleGroup}>
                      <View
                        style={[
                          styles.rankBadge,
                          rank <= 3 && styles.rankBadgeTop,
                        ]}
                      >
                        <Text
                          style={[
                            styles.rankBadgeText,
                            rank <= 3 && styles.rankBadgeTextTop,
                          ]}
                        >
                          #{rank}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.agencyName}>{ag.agency_name}</Text>
                        <Text style={styles.agencyLoc}>
                          {locationLine} · {ag.agency_type || 'Agency'}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={[
                        styles.auditBadge,
                        isUnaudited ? styles.auditBadgeWarn : styles.auditBadgeOk,
                      ]}
                    >
                      <Text
                        style={[
                          styles.auditBadgeText,
                          isUnaudited ? { color: '#fbbf24' } : { color: '#4ade80' },
                        ]}
                      >
                        {isUnaudited ? 'Audit Hidden' : ag.public_search_audit ? 'Audit Published ✓' : 'Portal Verified'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cardStatsRow}>
                    <View style={styles.cardStatCell}>
                      <Text style={styles.cardStatLabel}>Retention</Text>
                      <Text style={[styles.cardStatValue, { color: retentionColor }]}>
                        {retention ? `${retention.toLocaleString()} days` : '—'}
                      </Text>
                    </View>
                    <View style={styles.cardStatCell}>
                      <Text style={styles.cardStatLabel}>Outside Agencies</Text>
                      <Text style={styles.cardStatValue}>
                        {ag.organization_count !== null && ag.organization_count !== undefined
                          ? `${ag.organization_count.toLocaleString()}`
                          : '—'}
                      </Text>
                    </View>
                    <View style={styles.cardStatCell}>
                      <Text style={styles.cardStatLabel}>30d Vehicles</Text>
                      <Text style={styles.cardStatValue}>{formatCompact(ag.vehicles_captured)}</Text>
                    </View>
                    <View style={styles.cardStatCell}>
                      <Text style={styles.cardStatLabel}>Fleet / Searches</Text>
                      <Text style={styles.cardStatValue}>
                        {ag.total_cameras ?? '—'} cam · {formatCompact(ag.total_searches)}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}

            {agencies.length < totalMatching && (
              <TouchableOpacity
                style={styles.loadMoreBtn}
                onPress={handleLoadMore}
                disabled={loadingMore}
              >
                <Text style={styles.loadMoreText}>
                  {loadingMore
                    ? 'Loading more agencies…'
                    : `Load Next ${Math.min(PAGE_SIZE, totalMatching - agencies.length)} Agencies (${(totalMatching - agencies.length).toLocaleString()} remaining)`}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
          </>
        )}

        {/* Attribution Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Data sourced from public Flock Safety transparency portals aggregated by Eyes on Flock (CC BY-SA 4.0).
            Want to opt out or avoid ALPR corridors while driving?
          </Text>
          <View style={styles.footerActions}>
            <TouchableOpacity style={styles.footerBtn} onPress={() => navigate('/')}>
              <Text style={styles.footerBtnText}>Open Privacy Router →</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.footerBtn, { backgroundColor: '#4ade8022', borderColor: '#4ade8055' }]}
              onPress={() => navigate('/lockdown')}
            >
              <Text style={[styles.footerBtnText, { color: '#4ade80' }]}>🛡️ Commuter Lockdown</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Full Agency Accountability Dossier Modal */}
      <Modal
        visible={!!selectedSlug}
        animationType="fade"
        transparent
        onRequestClose={() => setSelectedSlug('')}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.modalEyebrow}>AGENCY TRANSPARENCY DOSSIER</Text>
                <Text style={styles.modalTitle}>
                  {detail?.agency_name || 'Loading agency dossier…'}
                </Text>
                {detail && (
                  <Text style={styles.modalSub}>
                    {[detail.city, detail.county ? `${detail.county} County` : null, detail.state]
                      .filter(Boolean)
                      .join(' · ')}
                    {detail.population ? ` · Pop. ${detail.population.toLocaleString()}` : ''}
                  </Text>
                )}
              </View>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setSelectedSlug('')}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {detailLoading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color="#4ade80" />
              </View>
            ) : !detail ? (
              <View style={styles.modalLoading}>
                <Text style={styles.errorText}>Portal record not found.</Text>
              </View>
            ) : (
              <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalBody}>
                {/* Action Buttons */}
                <View style={styles.modalActionRow}>
                  <TouchableOpacity
                    style={styles.modalPrimaryBtn}
                    onPress={() => Linking.openURL(detail.portal_url)}
                  >
                    <Text style={styles.modalPrimaryBtnText}>Open Official Flock Portal ↗</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalSecondaryBtn, showFoiaDraft && { borderColor: '#4ade80', backgroundColor: '#052e16' }]}
                    onPress={() => {
                      setShowFoiaDraft(v => !v);
                      try {
                        track('foia_generator_toggled', { slug: detail.slug, state: detail.state });
                      } catch {}
                    }}
                  >
                    <Text style={[styles.modalSecondaryBtnText, showFoiaDraft && { color: '#4ade80' }]}>
                      {showFoiaDraft ? '▲ Hide FOIA Draft' : '📝 Generate FOIA Request'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalSecondaryBtn}
                    onPress={() =>
                      Linking.openURL(
                        `https://www.muckrock.com/foi/list/?q=${encodeURIComponent(`${detail.agency_name} Flock`)}`
                      )
                    }
                  >
                    <Text style={styles.modalSecondaryBtnText}>🔎 Search MuckRock FOIAs ↗</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalSecondaryBtn}
                    onPress={() => copyShareUrl(`modal-${detail.slug}`, detail.slug)}
                  >
                    <Text style={styles.modalSecondaryBtnText}>
                      {copiedShareKey === `modal-${detail.slug}` ? '✓ Link Copied' : '🔗 Copy Direct Link'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {showFoiaDraft && (
                  <View style={[styles.policyBox, { borderColor: '#4ade8066', gap: 8 }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <Text style={[styles.sectionMiniTitle, { color: '#4ade80', marginBottom: 0 }]}>
                        STATE-LAW FOIA / PUBLIC RECORDS REQUEST TEMPLATE ({detail.state})
                      </Text>
                      <TouchableOpacity
                        style={[styles.modalPrimaryBtn, { backgroundColor: '#15803d', paddingVertical: 6, paddingHorizontal: 10 }]}
                        onPress={() => {
                          try {
                            const txt = buildFoiaRequestText(detail);
                            if (typeof navigator !== 'undefined' && navigator.clipboard) {
                              navigator.clipboard.writeText(txt);
                            }
                            track('foia_letter_copied', { slug: detail.slug, state: detail.state });
                            setCopiedShareKey(`foia-${detail.slug}`);
                            setTimeout(() => setCopiedShareKey(prev => (prev === `foia-${detail.slug}` ? null : prev)), 2200);
                          } catch {}
                        }}
                      >
                        <Text style={styles.modalPrimaryBtnText}>
                          {copiedShareKey === `foia-${detail.slug}` ? '✓ FOIA Letter Copied' : '📋 Copy Request Letter'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={[styles.policyText, { fontFamily: Platform.OS === 'web' ? 'monospace' : undefined, fontSize: 11.5 }]}>
                      {buildFoiaRequestText(detail)}
                    </Text>
                  </View>
                )}

                {/* Metrics Grid */}
                <View style={styles.detailGrid}>
                  <View style={styles.detailMetric}>
                    <Text style={styles.detailMetricLabel}>Data Retention</Text>
                    <Text style={styles.detailMetricVal}>
                      {detail.data_retention ? `${detail.data_retention.toLocaleString()} days` : '—'}
                    </Text>
                  </View>
                  <View style={styles.detailMetric}>
                    <Text style={styles.detailMetricLabel}>Cameras Reported</Text>
                    <Text style={styles.detailMetricVal}>
                      {detail.total_cameras !== null && detail.total_cameras !== undefined
                        ? detail.total_cameras.toLocaleString()
                        : '—'}
                    </Text>
                  </View>
                  <View style={styles.detailMetric}>
                    <Text style={styles.detailMetricLabel}>30d Captures</Text>
                    <Text style={styles.detailMetricVal}>
                      {detail.vehicles_captured !== null && detail.vehicles_captured !== undefined
                        ? detail.vehicles_captured.toLocaleString()
                        : '—'}
                    </Text>
                  </View>
                  <View style={styles.detailMetric}>
                    <Text style={styles.detailMetricLabel}>30d Searches</Text>
                    <Text style={styles.detailMetricVal}>
                      {detail.total_searches !== null && detail.total_searches !== undefined
                        ? detail.total_searches.toLocaleString()
                        : '—'}
                    </Text>
                  </View>
                  <View style={styles.detailMetric}>
                    <Text style={styles.detailMetricLabel}>Hotlist Hits (30d)</Text>
                    <Text style={styles.detailMetricVal}>
                      {detail.hotlist_hits !== null && detail.hotlist_hits !== undefined
                        ? `${detail.hotlist_hits.toLocaleString()}${detail.hotlist_hit_rate !== null && detail.hotlist_hit_rate !== undefined ? ` (${(detail.hotlist_hit_rate * 100).toFixed(3)}%)` : ''}`
                        : '—'}
                    </Text>
                  </View>
                  <View style={styles.detailMetric}>
                    <Text style={styles.detailMetricLabel}>Public Search Audit</Text>
                    <Text
                      style={[
                        styles.detailMetricVal,
                        { color: detail.public_search_audit ? '#4ade80' : '#fbbf24' },
                      ]}
                    >
                      {detail.public_search_audit ? 'Published ✓' : 'Not Publicly Published'}
                    </Text>
                  </View>
                </View>

                {/* Civic Enforcement Actions & Municipal Contract */}
                {detail.actions && detail.actions.length > 0 && (
                  <View style={styles.policyBox}>
                    <Text style={styles.sectionMiniTitle}>LEGAL ACTIONS &amp; STATE STATUTES</Text>
                    <View style={{ gap: 8 }}>
                      {detail.actions.map(act => (
                        <View key={act.action_key} style={styles.dossierCivicItem}>
                          <Text style={styles.dossierCivicTitle}>
                            {act.statute_or_vote ? `[${act.statute_or_vote}] ` : ''}{act.headline}
                          </Text>
                          <Text style={styles.policyText}>{act.summary}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {detail.contract && (
                  <View style={styles.policyBox}>
                    <Text style={styles.sectionMiniTitle}>MUNICIPAL ALPR CONTRACT ({detail.contract.status.toUpperCase()})</Text>
                    <Text style={styles.dossierCivicTitle}>
                      {detail.contract.vendor}
                      {detail.contract.contract_value_usd ? ` · $${detail.contract.contract_value_usd.toLocaleString()}` : ''}
                      {detail.contract.annual_cost_usd ? ` (~$${detail.contract.annual_cost_usd.toLocaleString()}/yr)` : ''}
                    </Text>
                    <Text style={styles.policyText}>{detail.contract.notes}</Text>
                  </View>
                )}

                {detail.incidents && detail.incidents.length > 0 && (
                  <View style={[styles.policyBox, { borderColor: '#ef444466' }]}>
                    <Text style={[styles.sectionMiniTitle, { color: '#f87171' }]}>DOCUMENTED MISUSE / AUDIT INCIDENTS</Text>
                    <View style={{ gap: 8 }}>
                      {detail.incidents.map(inc => (
                        <View key={inc.incident_key} style={styles.dossierCivicItem}>
                          <Text style={styles.dossierCivicTitle}>{inc.headline} ({inc.incident_date})</Text>
                          <Text style={styles.policyText}>{inc.summary}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {detail.federal_awards && detail.federal_awards.length > 0 && (
                  <View style={[styles.policyBox, { borderColor: '#4ade8055' }]}>
                    <Text style={[styles.sectionMiniTitle, { color: '#4ade80' }]}>FEDERAL GRANTS &amp; CONTRACTS (USASPENDING.GOV)</Text>
                    <View style={{ gap: 8 }}>
                      {detail.federal_awards.map(aw => (
                        <View key={aw.award_id} style={styles.dossierCivicItem}>
                          <Text style={styles.dossierCivicTitle}>
                            ${Math.round(aw.amount_usd).toLocaleString()} {aw.award_type.toUpperCase()} · {aw.awarding_agency}
                          </Text>
                          <Text style={styles.policyText}>{aw.description}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Prohibited Uses */}
                {!!detail.prohibited_uses && (
                  <View style={styles.policyBox}>
                    <Text style={styles.sectionMiniTitle}>STATED PROHIBITED USES</Text>
                    <Text style={styles.policyText}>{detail.prohibited_uses}</Text>
                  </View>
                )}

                {/* Sharing Network Explorer */}
                <View style={styles.networkBox}>
                  <View style={styles.networkTabs}>
                    <TouchableOpacity
                      style={[styles.networkTab, partnerTab === 'shared' && styles.networkTabActive]}
                      onPress={() => setPartnerTab('shared')}
                    >
                      <Text
                        style={[
                          styles.networkTabText,
                          partnerTab === 'shared' && styles.networkTabTextActive,
                        ]}
                      >
                        Outgoing Shares ({detail.organization_count ?? detail.organizations_shared_with?.length ?? 0})
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.networkTab, partnerTab === 'received' && styles.networkTabActive]}
                      onPress={() => setPartnerTab('received')}
                    >
                      <Text
                        style={[
                          styles.networkTabText,
                          partnerTab === 'received' && styles.networkTabTextActive,
                        ]}
                      >
                        Receiving Feeds ({detail.receiving_organization_count ?? detail.organizations_received_from?.length ?? 0})
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <TextInput
                    style={styles.partnerSearchInput}
                    placeholder="Filter partner agencies by name or state..."
                    placeholderTextColor="#64748b"
                    value={partnerFilter}
                    onChangeText={setPartnerFilter}
                    autoCapitalize="none"
                  />

                  {activePartnersList.length === 0 ? (
                    <Text style={styles.noPartnersText}>
                      {partnerFilter
                        ? 'No matching partner agencies in this list.'
                        : 'No external partner agencies listed on this portal snapshot.'}
                    </Text>
                  ) : (
                    <View style={styles.partnerChipWrap}>
                      {activePartnersList.slice(0, 200).map((name, i) => (
                        <View key={`${name}-${i}`} style={styles.partnerChip}>
                          <Text style={styles.partnerChipText}>{name}</Text>
                        </View>
                      ))}
                      {activePartnersList.length > 200 && (
                        <Text style={styles.truncatedNote}>
                          Showing first 200 of {activePartnersList.length.toLocaleString()} agencies — filter above to narrow down.
                        </Text>
                      )}
                    </View>
                  )}
                </View>

                <Text style={styles.dossierMeta}>
                  Attribution: {detail.attribution || 'Eyes on Flock (CC BY-SA 4.0)'}
                  {detail.data_last_updated
                    ? ` · Portal data updated ${new Date(detail.data_last_updated).toLocaleDateString()}`
                    : ''}
                </Text>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d0d1e' },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f3a',
    backgroundColor: '#0f0f24',
  },
  navBack: { paddingVertical: 4, paddingRight: 10 },
  navBackText: { color: '#4ade80', fontSize: 13, fontWeight: '700' },
  navLinks: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  navLink: { color: '#94a3b8', fontSize: 12.5 },
  navDot: { color: '#475569', fontSize: 12 },

  scroll: { flex: 1 },
  content: {
    padding: 16,
    paddingBottom: 48,
    maxWidth: 1020,
    width: '100%',
    alignSelf: 'center',
  },

  hero: { marginBottom: 16 },
  statusPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#172554',
    borderColor: '#3b82f655',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  statusPillText: { color: '#93c5fd', fontSize: 10.5, fontWeight: '700', letterSpacing: 0.4 },
  heroTitle: { color: '#f8fafc', fontSize: 26, fontWeight: '800', marginBottom: 6, lineHeight: 32 },
  heroSub: { color: '#94a3b8', fontSize: 14, lineHeight: 20, maxWidth: 740 },

  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  kpiCard: {
    flex: 1,
    minWidth: 150,
    backgroundColor: '#13132a',
    borderWidth: 1,
    borderColor: '#232346',
    borderRadius: 10,
    padding: 12,
  },
  kpiCardWarn: { borderColor: '#f59e0b44' },
  kpiValue: { color: '#f8fafc', fontSize: 22, fontWeight: '800' },
  kpiLabel: { color: '#94a3b8', fontSize: 11.5, marginTop: 2 },

  controlsCard: {
    backgroundColor: '#13132a',
    borderWidth: 1,
    borderColor: '#232346',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    gap: 10,
  },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  searchInput: {
    flex: 1,
    minWidth: 220,
    backgroundColor: '#0b0b1a',
    borderWidth: 1,
    borderColor: '#2e2e57',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#f8fafc',
    fontSize: 13.5,
  },
  clearBtn: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  clearBtnText: { color: '#cbd5e1', fontSize: 13, fontWeight: '700' },
  shareFilterBtn: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  shareFilterBtnText: { color: '#e2e8f0', fontSize: 12.5, fontWeight: '600' },

  controlLabel: { color: '#64748b', fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginTop: 2 },
  pillRow: { flexDirection: 'row', gap: 6, paddingVertical: 2 },
  filterPill: {
    backgroundColor: '#0b0b1a',
    borderWidth: 1,
    borderColor: '#25254a',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  filterPillActive: { backgroundColor: '#1d4ed8', borderColor: '#3b82f6' },
  filterPillText: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
  filterPillTextActive: { color: '#ffffff' },

  sortPill: {
    backgroundColor: '#0b0b1a',
    borderWidth: 1,
    borderColor: '#25254a',
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  sortPillActive: { backgroundColor: '#14532d', borderColor: '#4ade80' },
  sortPillText: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
  sortPillTextActive: { color: '#4ade80', fontWeight: '700' },

  auditRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  auditPill: {
    backgroundColor: '#0b0b1a',
    borderWidth: 1,
    borderColor: '#25254a',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  auditPillActive: { backgroundColor: '#312e81', borderColor: '#6366f1' },
  auditPillText: { color: '#94a3b8', fontSize: 11.5, fontWeight: '600' },
  auditPillTextActive: { color: '#e0e7ff' },

  resultsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  resultsText: { color: '#94a3b8', fontSize: 12 },
  resetFiltersText: { color: '#60a5fa', fontSize: 12, fontWeight: '600' },

  loadingBox: { paddingVertical: 48, alignItems: 'center', gap: 10 },
  loadingText: { color: '#94a3b8', fontSize: 13 },
  errorBox: {
    backgroundColor: '#7f1d1d33',
    borderWidth: 1,
    borderColor: '#ef444466',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    gap: 10,
  },
  errorText: { color: '#fca5a5', fontSize: 13 },
  retryBtn: {
    backgroundColor: '#ef4444',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  retryBtnText: { color: '#ffffff', fontSize: 12.5, fontWeight: '700' },

  emptyBox: {
    backgroundColor: '#13132a',
    borderRadius: 10,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#232346',
  },
  emptyTitle: { color: '#f8fafc', fontSize: 15, fontWeight: '700', marginBottom: 4 },
  emptySub: { color: '#94a3b8', fontSize: 13 },

  list: { gap: 10 },
  agencyCard: {
    backgroundColor: '#13132a',
    borderWidth: 1,
    borderColor: '#232346',
    borderRadius: 10,
    padding: 14,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  cardTitleGroup: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  rankBadge: {
    backgroundColor: '#1e293b',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    minWidth: 32,
    alignItems: 'center',
  },
  rankBadgeTop: { backgroundColor: '#f59e0b22', borderWidth: 1, borderColor: '#f59e0b66' },
  rankBadgeText: { color: '#94a3b8', fontSize: 11.5, fontWeight: '700' },
  rankBadgeTextTop: { color: '#fbbf24' },
  agencyName: { color: '#f8fafc', fontSize: 15.5, fontWeight: '700' },
  agencyLoc: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  auditBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderWidth: 1,
  },
  auditBadgeWarn: { backgroundColor: '#451a0366', borderColor: '#f59e0b55' },
  auditBadgeOk: { backgroundColor: '#052e1666', borderColor: '#4ade8055' },
  auditBadgeText: { fontSize: 11, fontWeight: '700' },

  cardStatsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cardStatCell: { flex: 1, minWidth: 120 },
  cardStatLabel: { color: '#64748b', fontSize: 10.5, marginBottom: 2 },
  cardStatValue: { color: '#e2e8f0', fontSize: 13.5, fontWeight: '700' },

  loadMoreBtn: {
    marginTop: 6,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  loadMoreText: { color: '#f8fafc', fontSize: 13, fontWeight: '700' },

  footer: {
    marginTop: 28,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: '#1f1f3a',
    gap: 12,
  },
  footerText: { color: '#64748b', fontSize: 12, lineHeight: 18 },
  footerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  footerBtn: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  footerBtnText: { color: '#f8fafc', fontSize: 13, fontWeight: '700' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 5, 15, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#13132a',
    borderWidth: 1,
    borderColor: '#2e2e57',
    borderRadius: 14,
    width: '100%',
    maxWidth: 720,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#232346',
    backgroundColor: '#0f0f24',
  },
  modalEyebrow: { color: '#4ade80', fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 4 },
  modalTitle: { color: '#f8fafc', fontSize: 19, fontWeight: '800' },
  modalSub: { color: '#94a3b8', fontSize: 12.5, marginTop: 3 },
  modalCloseBtn: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  modalCloseText: { color: '#e2e8f0', fontSize: 14, fontWeight: '700' },

  modalLoading: { padding: 40, alignItems: 'center' },
  modalScroll: { maxHeight: '100%' },
  modalBody: { padding: 16, gap: 14 },

  modalActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modalPrimaryBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  modalPrimaryBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  modalSecondaryBtn: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  modalSecondaryBtnText: { color: '#e2e8f0', fontSize: 13, fontWeight: '600' },

  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  detailMetric: {
    flex: 1,
    minWidth: 140,
    backgroundColor: '#0b0b1a',
    borderWidth: 1,
    borderColor: '#232346',
    borderRadius: 8,
    padding: 10,
  },
  detailMetricLabel: { color: '#64748b', fontSize: 10.5, marginBottom: 3 },
  detailMetricVal: { color: '#f8fafc', fontSize: 14, fontWeight: '700' },

  policyBox: {
    backgroundColor: '#0b0b1a',
    borderWidth: 1,
    borderColor: '#232346',
    borderRadius: 8,
    padding: 12,
  },
  sectionMiniTitle: { color: '#64748b', fontSize: 10, fontWeight: '800', letterSpacing: 0.7, marginBottom: 6 },
  policyText: { color: '#cbd5e1', fontSize: 12.5, lineHeight: 18 },

  networkBox: {
    backgroundColor: '#0b0b1a',
    borderWidth: 1,
    borderColor: '#232346',
    borderRadius: 8,
    padding: 12,
    gap: 10,
  },
  networkTabs: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  networkTab: {
    backgroundColor: '#13132a',
    borderWidth: 1,
    borderColor: '#25254a',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  networkTabActive: { backgroundColor: '#1e3a8a', borderColor: '#3b82f6' },
  networkTabText: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
  networkTabTextActive: { color: '#ffffff' },
  partnerSearchInput: {
    backgroundColor: '#13132a',
    borderWidth: 1,
    borderColor: '#25254a',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    color: '#f8fafc',
    fontSize: 12.5,
  },
  noPartnersText: { color: '#64748b', fontSize: 12.5 },
  partnerChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  partnerChip: {
    backgroundColor: '#13132a',
    borderWidth: 1,
    borderColor: '#25254a',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  partnerChipText: { color: '#cbd5e1', fontSize: 11.5 },
  truncatedNote: { color: '#64748b', fontSize: 11.5, marginTop: 4, width: '100%' },
  dossierMeta: { color: '#64748b', fontSize: 11 },

  modeTabRow: { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  modeTabBtn: {
    flex: 1,
    minWidth: 180,
    backgroundColor: '#13132a',
    borderWidth: 1,
    borderColor: '#25254a',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  modeTabBtnActive: { backgroundColor: '#1e3a8a', borderColor: '#3b82f6' },
  modeTabText: { color: '#94a3b8', fontSize: 13.5, fontWeight: '700' },
  modeTabTextActive: { color: '#ffffff' },

  civicSectionTitle: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 6,
  },
  civicCardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  civicActionLink: {
    backgroundColor: '#1e3a8a55',
    borderWidth: 1,
    borderColor: '#3b82f666',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  civicActionLinkText: { color: '#93c5fd', fontSize: 12, fontWeight: '700' },
  sourceCiteText: { color: '#64748b', fontSize: 11.5 },
  statuteBadge: { backgroundColor: '#172554', borderColor: '#3b82f666' },
  alertBadge: { backgroundColor: '#450a0a', borderColor: '#ef444466' },
  dossierCivicItem: {
    backgroundColor: '#13132a',
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: '#232346',
  },
  dossierCivicTitle: { color: '#f8fafc', fontSize: 12.5, fontWeight: '700', marginBottom: 3 },
});
