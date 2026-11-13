# Architecture and migration audit

## Verified source and public surfaces

The new workspace is a static HTML/CSS/JavaScript export with hash routing and a service worker. No framework, build dependency or Git metadata was present. The adjacent website checkout contains the legacy staff HTML, templates and build scripts, the Apps Script project under `staff-portal/files`, packaged releases, and an earlier Worker that redirects a staff subdomain to Google. The legacy HTML sends JSON in a POST body to Apps Script. A public read returned the staff portal shell and the main website. The supplied GitHub Pages path could not be retrieved by the web reader. The deployed Apps Script revision, live Sheets headers, route precedence, DNS and cache rules remain unverified.

The authoritative server contract is the explicit `portalHandlers_` allowlist. The app uses its staff and family email-code flows, signed session expiry and revocation, server permissions, and record ownership checks. Staff roles are CAREGIVER, SCHEDULER and ADMIN. Family contacts have a separate session kind restricted by client authorisation. Scheduler override and family-update approval are optional server settings. The app uses memory-only sessions, so reloads require another code. The existing passwordless flow provides account access through a new code.

## Google Sheets mapping

This is the source schema. Verify the live headers against `Setup.gs`, `Geofence.gs`, `Family.gs` and `ShiftCorrections.gs` before enabling a production route.

| Tabs | Primary identifiers and relationships | Representative columns |
| --- | --- | --- |
| Employees | Employee_ID, Email is the login identity | Role, Employment_Status, Hourly_Rate |
| Service_Locations | Location_ID | Street_Address, Latitude, Longitude, Geofence_Radius_Miles |
| Shifts | Shift_ID links to Assigned_Employee_ID, Location_ID and Client_ID | Shift_Date, Start_Time, End_Time, Shift_Status, Pay_Type, Correction_Version |
| Shift_Requests | Request_ID links Shift_ID and Employee_ID | Request_Status, Requested_At, Reviewed_By |
| Time_Entries | Time_Entry_ID links Shift_ID and Employee_ID | Clock_In_Time, Clock_Out_Time, Total_Hours, Entry_Status |
| Time_Correction_Requests | Correction_Request_ID links Time_Entry_ID and Employee_ID | Reason, Request_Status, Management_Response |
| Shift_Correction_History | Event_ID, Correction_ID and Shift_ID | Version, Event_Type, Actor_ID, Timestamp, Reason, Before_JSON, After_JSON |
| Clock_Events | Event_ID and Attempt_ID link to shift, employee and time entry | Result, Result_Code, Allowed_Radius_Miles and recorded device evidence |
| Geofence_Overrides, Geofence_Override_Requests | Event_ID identifies the reviewed attempt, requests have Request_ID | Decision, Reason_Text, Requested_At |
| Availability, Qualifications | Availability_ID or Qualification_ID links Employee_ID | Date, Available_From, Available_To, Expiration_Date, Verification_Status |
| Clients, Family_Contacts, Visit_Care | Client_ID, Contact_ID and Shift_ID | Display_Name, Active_Status, Tasks_Done, Staff_Note, Approval_Status, Family_Update |
| Notifications | Notification_ID links Recipient_Employee_ID and Related_Record_ID | Notification_Type, Read_Status, Created_At |
| Settings, Audit_Log, Init_Log | Setting_Key, Audit_ID and Init_ID | Setting_Value, Action, Record_ID, Previous_Value, New_Value, Summary |

The existing backend owns assignments, open-shift approval, hours, location exceptions, availability, visit notes and payroll. Clock-in requires an assigned, eligible shift and verified location. Clock-out can be recorded with a location exception for review. Radius precedence is shift override, location override, then global configuration. The UI submits the existing GPS attempt identifier and timestamps. Server locks and shift-state checks reject duplicate successful punches. The identifier correlates attempts and does not give full response replay or transactional recovery after a partial attendance write. Achieving those guarantees would require a change to the shared backend and a staged concurrency/failure test. The UI retries only explicit backend BUSY responses.

Completed-shift corrections use versioned proposals and approval. The server writes before/after values, actor, timestamp and reason, preserves original Clock_Events, and applies accepted corrections via a Sheets batch. The reporting and export paths use the existing payroll workflow. Source notifications include OTP and welcome emails, shift offers and requests, assignment and exceptions, correction and override decisions, family updates, plus timed shift, late/missing punch, qualification and timesheet reminders. Enabled triggers, email routing and actual delivery require verification in the target project.

## Security and acceptance gaps

Client addresses, visit notes, family associations and time-linked location can be sensitive or regulated. Worker responses use no-store and a same-origin request boundary. The PWA caches an explicit list of static assets. No session token, request history, GPS sample or protected response is persisted by the new app. Backend access controls remain authoritative, including for the legacy direct Apps Script URL. Worker origin checks do not restrict that direct URL. The server already limits sign-in and GPS attempts. Confirm edge limits against real traffic before rollout. Review Google and Cloudflare vendor agreements, workforce data retention, audit access and deletion policy with the organisation before processing regulated records.

The UI reuses existing scheduling and time-management screens. Availability has a caregiver editor and a management schedule view, and completed-shift editing uses the shared backend contract. The Worker reports upstream configuration and availability failures during requests. Dedicated integration health reporting, WCAG 2.2 AA sign-off, and durable attendance response replay remain open. Open-shift withdrawal currently needs the request ID returned during that session. The existing open-shift response exposes only an AlreadyRequested flag, so a shared server contract change is needed for cross-session withdrawal in this app.

## Migration sequence

1. Confirm the authoritative repository, deployed Apps Script version, staging URL, role test accounts and live schema via headers-only inspection. Use the existing staging environment. Confirm which URL handles invitation links.
2. Run preview acceptance and compare the same staging records in the original and new portals. Confirm email routing and scheduler policy settings. Verify actual device GPS and denial behaviour without changing radius settings.
3. Audit Cloudflare routing and cache rules. Promote only the app path after approval, then consider primary staff URL promotion separately. Follow the README rollback instructions if acceptance fails.

## Local test results

- Legacy Apps Script with mocked Google services passed 49 workflow checks, 17 role checks and the completed-shift correction regression suite.
- The frontend, service worker and Worker passed JavaScript syntax checks. The preview bundle built without the demo backend.
- Headless Chrome demo sign-in and dashboard rendering passed for caregiver, scheduler, admin and family at 320 px in dark appearance. No horizontal document overflow or browser storage entries were observed.
- All 77 literal frontend API method names were found in the legacy dispatcher.
- Mocked Worker checks passed for same-origin enforcement, input and body size validation, route scope, Apps Script redirect handling and no-store responses.
- Real email, real-device GPS, live shared writes, production cache rules and end-to-end rollout remain pending staging access and acceptance.
