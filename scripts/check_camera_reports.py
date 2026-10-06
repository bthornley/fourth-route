#!/usr/bin/env python3
"""
Camera Report Notifier for Fourth Route
Queries Supabase PostgreSQL database directly for pending camera reports and dispatches email notifications via Apple Mail.
"""

import os
import sys
import json
import subprocess
import psycopg2
import psycopg2.extras

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres.wftprktyohywftvnlrfy:wc3BqYhqGSY0PnB4@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
)
NOTIFIED_FILE = os.path.expanduser("~/.gemini/antigravity/camera_reports_notified.json")

def load_notified():
    if os.path.exists(NOTIFIED_FILE):
        try:
            with open(NOTIFIED_FILE, "r") as f:
                return set(json.load(f))
        except Exception:
            return set()
    return set()

def save_notified(ids):
    os.makedirs(os.path.dirname(NOTIFIED_FILE), exist_ok=True)
    with open(NOTIFIED_FILE, "w") as f:
        json.dump(list(ids), f)

def send_apple_mail(subject, body, to_addr="bthornley@gmail.com"):
    applescript = """
    on run {toAddr, msgSubject, msgBody}
        tell application "Mail"
            set newMsg to make new outgoing message with properties {subject:msgSubject, content:msgBody, visible:false}
            tell newMsg
                set sender to "Blake Thornley <bthornley@gmail.com>"
                make new to recipient at end of to recipients with properties {address:toAddr}
            end tell
            send newMsg
        end tell
    end run
    """
    res = subprocess.run(["osascript", "-e", applescript, to_addr, subject, body], capture_output=True, text=True)
    return res.returncode == 0

def check_queue():
    try:
        conn = psycopg2.connect(DB_URL)
    except Exception as e:
        print(f"Error connecting to database: {e}")
        return

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT * FROM camera_reports WHERE status = 'pending' ORDER BY created_at ASC")
        reports = cur.fetchall()

    conn.close()

    print(f"Found {len(reports)} pending camera report(s) in database.")

    if not reports:
        print("Queue is empty. No new reports.")
        return

    notified = load_notified()
    new_reports = [rep for rep in reports if rep["id"] not in notified]

    if not new_reports:
        print("All pending reports have already been notified.")
        return

    print(f"Dispatching notifications for {len(new_reports)} new report(s)...")

    for rep in new_reports:
        rep_id = rep["id"]
        lat = rep["lat"]
        lon = rep["lon"]
        operator = rep.get("operator") or "Not specified"
        notes = rep.get("notes") or "None"
        submitted_at = str(rep.get("created_at") or "Recently")
        
        map_link = f"https://fourthroute.org?lat={lat}&lon={lon}"
        gmaps_link = f"https://www.google.com/maps/search/?api=1&query={lat},{lon}"

        subject = f"🚨 New Camera Report #{rep_id} ({lat:.4f}, {lon:.4f})"
        body = f"""Hi Blake,

A user submitted a new camera sighting on Fourth Route:

• Report ID: #{rep_id}
• Coordinates: {lat}, {lon}
• Operator: {operator}
• Notes: {notes}
• Submitted: {submitted_at}

Inspect Location:
• Fourth Route: {map_link}
• Google Maps: {gmaps_link}

To approve this camera and add it directly to the active routing network:
curl -X POST "https://fourth-route-production.up.railway.app/admin/reports/{rep_id}/approve?admin_token=fourthroute-admin-2026"

To reject:
curl -X POST "https://fourth-route-production.up.railway.app/admin/reports/{rep_id}/reject?admin_token=fourthroute-admin-2026"

— Fourth Route Queue Monitor
"""
        success = send_apple_mail(subject, body)
        if success:
            print(f"✅ Dispatched alert email for Report #{rep_id}")
            notified.add(rep_id)
        else:
            print(f"❌ Failed to dispatch email for Report #{rep_id}")

    save_notified(notified)

if __name__ == "__main__":
    check_queue()
