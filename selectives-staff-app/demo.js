/*
 * Demo backend: used only when config.js has API_URL: 'DEMO'.
 * An in-memory imitation of the Apps Script API with sample data, so the
 * app can be shown to anyone without a Google account. Nothing is saved;
 * reloading resets it. Not loaded for real deployments' data in any way.
 */
(function () {
  'use strict';
  if (!window.APP_CONFIG || window.APP_CONFIG.API_URL !== 'DEMO') return;
  var TZ = window.APP_CONFIG.TIME_ZONE || 'America/New_York';
  var PERMS = {
    CAREGIVER: ['shift.view_own', 'shift.view_open', 'shift.request', 'attendance.clock_in', 'attendance.clock_out', 'attendance.view_own', 'attendance.report_problem', 'location.verify', 'location.request_override', 'timesheet.view_own', 'availability.manage_own', 'notification.view_own', 'profile.view_own', 'qualification.view_own', 'visit.record_own'],
    SCHEDULER: ['shift.view_all', 'shift.create', 'shift.edit', 'shift.assign', 'shift.approve_request', 'attendance.view_all', 'location.view_status', 'availability.view_all', 'staff.view_directory', 'qualification.view_all', 'qualification.manage', 'site.manage', 'summary.view_operations', 'client.view_all', 'client.manage', 'visit.view_all', 'notification.view_own', 'profile.view_own'],
    ADMIN: ['shift.correct_completed', 'shift.view_all', 'shift.create', 'shift.edit', 'shift.assign', 'shift.approve_request', 'attendance.view_all', 'location.view_status', 'location.approve_override', 'availability.view_all', 'staff.view_directory', 'staff.view_pay', 'staff.manage', 'role.manage', 'qualification.view_all', 'qualification.manage', 'site.manage', 'timesheet.review', 'timesheet.approve', 'timesheet.export', 'time.correct', 'summary.view_operations', 'summary.view_payroll', 'audit.view', 'system.manage', 'client.view_all', 'client.manage', 'family.manage', 'visit.view_all', 'visit.approve_family_update', 'notification.view_own', 'profile.view_own']
  };
  var TASKS = ['Personal care', 'Meal preparation', 'Light housekeeping', 'Mobility assistance', 'Medication reminder', 'Companionship', 'Laundry', 'Errands or transportation'];
  var REASONS = ['Incorrect clock-in time', 'Incorrect clock-out time', 'Caregiver forgot to clock out', 'Incorrect caregiver assignment', 'Incorrect service date', 'Incorrect shift duration', 'Incorrect visit notes', 'Administrative correction', 'Other'];

  function V(msg) { var e = new Error(msg); e.name = 'ValidationError'; return e; }
  function AuthE(msg) { var e = new Error(msg); e.name = 'AuthError'; return e; }
  function n() { return Date.now(); }
  var seq = 1000; function id(p) { return p + '_' + (++seq).toString(16).toUpperCase() + Math.random().toString(16).slice(2, 7).toUpperCase(); }
  var dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  function today() { return dayFmt.format(new Date()); }
  function addDays(s, k) { var d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); }
  function nyHour() { return Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(new Date())); }
  function pad(x) { return (x < 10 ? '0' : '') + x; }
  /** 'YYYY-MM-DD' + 'HH:mm' in the agency zone -> Date */
  function at(date, time) {
    var offs = ['-05:00', '-04:00'];
    for (var i = 0; i < offs.length; i++) { var d = new Date(date + 'T' + time + ':00' + offs[i]); var p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d); if (p === time) return d; }
    return new Date(date + 'T' + time + ':00-05:00');
  }
  function times(s) { var a = at(s.Shift_Date, s.Start_Time), b = at(s.Shift_Date, s.End_Time); if (b <= a) b = new Date(b.getTime() + 86400000); return { start: a, end: b }; }
  function iso(d) { return new Date(d).toISOString(); }

  /* ---------------- seed ---------------- */
  var T = today(), H = Math.min(Math.max(nyHour(), 2), 20);
  var D = { emp: [], loc: [], shifts: [], req: [], te: [], avail: [], quals: [], notes: [], corr: [], events: [], overrides: [], ovReq: [], clients: [], contacts: [], care: [], audit: [], scHist: [], settings: {} };
  function emp(fn, ln, email, role, rate) { var e = { Employee_ID: id('EMP'), First_Name: fn, Last_Name: ln, Email: email, Phone: '443-555-0' + (100 + D.emp.length), Role: role, Employment_Status: 'ACTIVE', Hire_Date: '2024-03-01', Hourly_Rate: rate, Service_Areas: 'Towson, Lutherville', Qualifications: '', Qualification_Expiry: '', Maximum_Weekly_Hours: 40, Created_At: iso(n()), Updated_At: iso(n()) }; D.emp.push(e); return e; }
  var admin = emp('Amina', 'Okafor', 'admin@demo.com', 'ADMIN', 0);
  emp('Daniel', 'Reyes', 'scheduler@demo.com', 'SCHEDULER', 0);
  var grace = emp('Grace', 'Mensah', 'caregiver@demo.com', 'CAREGIVER', 19);
  var joy = emp('Joy', 'Kamau', 'joy@demo.com', 'CAREGIVER', 18.5);
  var peter = emp('Peter', 'Lewis', 'peter@demo.com', 'CAREGIVER', 18);
  function loc(label, area, addr, lat, lon) { var l = { Location_ID: id('LOC'), Location_Label: label, General_Service_Area: area, Street_Address: addr, Latitude: lat, Longitude: lon, Geofence_Radius_Miles: '', Active_Status: true, Coordinates_Source: 'GOOGLE_MAPS', Created_At: iso(n()), Updated_At: iso(n()) }; D.loc.push(l); return l; }
  var L1 = loc('Harris residence', 'Towson', '410 Bosley Ave, Towson, MD 21204', 39.4015, -76.6019);
  var L2 = loc('Mary’s home', 'Lutherville-Timonium', '1500 York Rd, Lutherville, MD 21093', 39.4213, -76.6236);
  var L3 = loc('Bennett apartment', 'Baltimore', '300 E Pratt St, Baltimore, MD 21202', 39.2867, -76.6122);
  var C1 = { Client_ID: id('CLI'), Display_Name: 'Mary', Location_ID: L2.Location_ID, Active_Status: 'TRUE' };
  var C2 = { Client_ID: id('CLI'), Display_Name: 'Mr. Harris', Location_ID: L1.Location_ID, Active_Status: 'TRUE' };
  D.clients.push(C1, C2);
  D.contacts.push({ Contact_ID: id('FAM'), Client_ID: C1.Client_ID, Name: 'Linda', Email: 'family@demo.com', Relationship: 'Daughter', Active_Status: 'TRUE', Authorized_By: admin.Email });
  function shift(date, st, en, l, empId, status, extra) {
    var s = Object.assign({ Shift_ID: id('SHF'), Shift_Date: date, Start_Time: st, End_Time: en, Location_ID: l.Location_ID, General_Service_Area: l.General_Service_Area, Required_Qualifications: '', Assigned_Employee_ID: empId || '', Shift_Status: status, Pay_Type: 'PRIVATE_PAY', Internal_Instructions: '', Published_As_Open: status === 'OPEN' || status === 'REQUESTED', Geofence_Radius_Miles: '', Client_ID: '', Correction_Status: '', Correction_Version: 0, Correction_Requested: '' }, extra || {});
    D.shifts.push(s); return s;
  }
  var sToday = shift(T, pad(H - 1) + ':00', pad(H + 3) + ':00', L2, grace.Employee_ID, 'ASSIGNED', { Client_ID: C1.Client_ID, Internal_Instructions: 'Gate code 4412. Mary prefers tea at 3.' });
  shift(addDays(T, 1), '09:00', '13:00', L1, grace.Employee_ID, 'ASSIGNED', { Client_ID: C2.Client_ID });
  shift(addDays(T, 3), '14:00', '18:00', L2, grace.Employee_ID, 'ASSIGNED', { Client_ID: C1.Client_ID });
  var sPast = shift(addDays(T, -1), '09:00', '13:00', L2, grace.Employee_ID, 'COMPLETED', { Client_ID: C1.Client_ID });
  var sPast2 = shift(addDays(T, -2), '15:00', '19:00', L1, joy.Employee_ID, 'COMPLETED', { Client_ID: C2.Client_ID, Pay_Type: 'MEDICAID_EVV' });
  var sPeter = shift(T, pad(H - 2) + ':00', pad(H + 2) + ':00', L1, peter.Employee_ID, 'IN_PROGRESS', { Client_ID: C2.Client_ID });
  var sJoyToday = shift(T, pad(H - 1) + ':30', pad(H + 2) + ':30', L3, joy.Employee_ID, 'ASSIGNED');
  var open1 = shift(addDays(T, 2), '08:00', '12:00', L3, '', 'REQUESTED');
  shift(addDays(T, 4), '13:00', '17:00', L1, '', 'OPEN', { Pay_Type: 'MEDICAID_EVV' });
  shift(addDays(T, 5), '18:00', '22:00', L2, '', 'DRAFT');
  shift(addDays(T, 6), '09:00', '15:00', L3, '', 'OPEN', { Required_Qualifications: 'CNA' });
  D.req.push({ Request_ID: id('REQ'), Shift_ID: open1.Shift_ID, Employee_ID: joy.Employee_ID, Request_Status: 'PENDING', Requested_At: iso(n() - 3600e3), Reviewed_By: '', Reviewed_At: '', Management_Note: '' });
  [2, 4, 6, 8].forEach(function (k) { D.avail.push({ Availability_ID: id('AVL'), Employee_ID: grace.Employee_ID, Date: addDays(T, k), Available_From: '', Available_To: '', Availability_Status: 'AVAILABLE', Note: '' }); });
  D.avail.push({ Availability_ID: id('AVL'), Employee_ID: joy.Employee_ID, Date: addDays(T, 2), Available_From: '07:00', Available_To: '15:00', Availability_Status: 'AVAILABLE', Note: '' });
  function te(s, inT, outT, status, gIn, gOut) {
    var a = at(s.Shift_Date, inT), b = outT ? at(s.Shift_Date, outT) : null;
    var e = { Time_Entry_ID: id('TE'), Shift_ID: s.Shift_ID, Employee_ID: s.Assigned_Employee_ID, Clock_In_Time: iso(a), Clock_In_Accuracy: 12, Clock_In_Distance_Meters: 18, Clock_In_Geofence_Status: gIn || 'INSIDE', Clock_Out_Time: b ? iso(b) : '', Clock_Out_Accuracy: b ? 15 : '', Clock_Out_Distance_Meters: b ? 22 : '', Clock_Out_Geofence_Status: b ? (gOut || 'INSIDE') : '', Total_Hours: b ? Math.round((b - a) / 36e3) / 100 : '', Entry_Status: status, Correction_Reason: '', Corrected_By: '', Corrected_At: '', Approved_By: '', Approved_At: '' };
    D.te.push(e); return e;
  }
  te(sPast, '08:58', '13:04', 'SUBMITTED');
  var teJoy = te(sPast2, '15:12', '19:01', 'EXCEPTION', 'INSIDE', 'OUTSIDE');
  te(sPeter, pad(H - 2) + ':03', null, 'OPEN');
  D.care.push({ Shift_ID: sPast.Shift_ID, Client_ID: C1.Client_ID, Tasks_Done: 'Meal preparation,Companionship,Light housekeeping', Staff_Note: 'Mary was cheerful, ate a full lunch and we did a short walk.', Approval_Status: 'PENDING', Family_Update: '', Submitted_By: grace.Employee_ID, Submitted_At: iso(n() - 20 * 3600e3) });
  var ev1 = { Event_ID: id('CEV'), Attempt_ID: 'LOC-demo', Server_Timestamp: iso(at(sPast2.Shift_Date, '19:01')), Employee_ID: joy.Employee_ID, Shift_ID: sPast2.Shift_ID, Event_Type: 'CLOCK_OUT', Distance_Miles: 0.71, GPS_Accuracy_Meters: 35, Allowed_Radius_Miles: 0.25, Result: 'BLOCKED', Detail: '', Time_Entry_ID: teJoy.Time_Entry_ID };
  D.events.push(ev1);
  D.ovReq.push({ Request_ID: id('GRQ'), Event_ID: ev1.Event_ID, Employee_ID: joy.Employee_ID, Shift_ID: sPast2.Shift_ID, Reason_Text: 'Had to park two blocks away, clocked out walking to the car.', Requested_At: iso(n() - 30 * 3600e3) });
  D.corr.push({ Correction_Request_ID: id('COR'), Time_Entry_ID: teJoy.Time_Entry_ID, Employee_ID: joy.Employee_ID, Requested_Clock_In: wallOff(sPast2.Shift_Date + 'T15:00'), Requested_Clock_Out: '', Reason: '[INCORRECT_TIME] I arrived at 3:00, the app was slow to load.', Request_Status: 'PENDING', Submitted_At: iso(n() - 26 * 3600e3), Reviewed_By: '', Reviewed_At: '', Management_Response: '' });
  function wallOff(w) { return iso(at(w.slice(0, 10), w.slice(11, 16))); }
  D.quals.push({ Qualification_ID: id('QUAL'), Employee_ID: grace.Employee_ID, Qualification_Type: 'CPR', Issue_Date: addDays(T, -345), Expiration_Date: addDays(T, 20), Verification_Status: 'VERIFIED', Verified_By: admin.Email });
  D.quals.push({ Qualification_ID: id('QUAL'), Employee_ID: joy.Employee_ID, Qualification_Type: 'CNA', Issue_Date: addDays(T, -100), Expiration_Date: addDays(T, 600), Verification_Status: 'PENDING' });
  function notify(empId, title, msg, rel) { D.notes.unshift({ Notification_ID: id('NTF'), Recipient_Employee_ID: empId, Notification_Type: 'INFO', Title: title, Message: msg, Related_Record_ID: rel || '', Read_Status: false, Created_At: iso(n()), Read_At: '' }); }
  notify(grace.Employee_ID, 'Upcoming shift reminder', 'You are scheduled today at Mary’s home.', sToday.Shift_ID);
  notify(grace.Employee_ID, 'New open shift available', 'An open shift on ' + addDays(T, 4) + ' in Towson matches your profile.', '');
  D.emp.filter(function (e) { return e.Role !== 'CAREGIVER'; }).forEach(function (m) { notify(m.Employee_ID, 'New shift request', 'Joy Kamau requested the shift on ' + open1.Shift_Date + '.', open1.Shift_ID); notify(m.Employee_ID, 'Attention needed', 'Joy Kamau: requested a location review (0.71 mi away).', sPast2.Shift_ID); });
  var SETTINGS = [['Organization_Name', 'Selectives Home Care', 'Name shown across the portal.'], ['Workweek_Start_Day', 'Sunday', 'First day of the standard workweek.'], ['Overtime_Threshold_Hours', '40', 'Weekly hours above which a possible-overtime warning is shown.'], ['Early_Clock_In_Allowance_Minutes', '15', 'Minutes before shift start a caregiver may clock in without a flag.'], ['Late_Clock_In_Threshold_Minutes', '10', 'Minutes after shift start that counts as late.'], ['Geofence_Radius_Miles', '0.25', 'Default clock-in radius.'], ['GPS_Max_Accuracy_Meters', '100', 'Readings less precise than this are not accepted.'], ['GPS_Max_Age_Seconds', '180', 'Older readings are rejected.'], ['Portal_Public_URL', '', 'Published HTTPS sign-in page used in welcome emails.'], ['Portal_Support_Email', 'admin@selectiveshomecare.com', 'Shown to staff for help.'], ['Portal_Support_Phone', '443-847-4057', 'Shown to staff for help.'], ['Email_Notifications_Enabled', 'TRUE', 'Master switch for outbound email.'], ['Payroll_Anchor_Date', '', 'Biweekly payroll start date.'], ['Payroll_Period_Type', 'WEEKLY', 'WEEKLY or BIWEEKLY.'], ['Show_Hourly_Rate_To_Caregiver', 'FALSE', 'Show pay rate to caregivers.'], ['Allow_Self_Approval_Shift_Corrections', 'TRUE', 'Demo: on so one admin can try the whole flow.'], ['Scheduler_Can_Review_Overrides', 'FALSE', 'Scheduler may decide GPS overrides.'], ['Scheduler_Can_Approve_Family_Updates', 'FALSE', 'Scheduler may approve family updates.'], ['Session_Duration_Hours', '12', 'Session length.']];
  SETTINGS.forEach(function (s) { D.settings[s[0]] = s[1]; });
  function audit(actor, action, type, rid, reason, prev, nv) { D.audit.unshift({ Audit_ID: id('AUD'), Timestamp: iso(n()), User_Email: actor ? actor.email : 'system', Employee_ID: actor ? actor.employeeId : '', User_Role: actor ? actor.role : '', Action: action, Record_Type: type, Record_ID: rid || '', Previous_Value: prev ? JSON.stringify(prev) : '', New_Value: nv ? JSON.stringify(nv) : '', Reason: reason || '', Device_Information: '' }); }
  audit({ email: admin.Email, employeeId: admin.Employee_ID, role: 'ADMIN' }, 'DEMO_DATA_LOADED', 'System', '', 'Sample data for the demo');

  /* ---------------- helpers ---------------- */
  function E(eid) { return D.emp.filter(function (e) { return e.Employee_ID === eid; })[0]; }
  function name(eid) { var e = E(eid); return e ? e.First_Name + ' ' + e.Last_Name : eid; }
  function S(sid) { var s = D.shifts.filter(function (x) { return x.Shift_ID === sid; })[0]; if (!s) throw V('Shift not found.'); return s; }
  function L(lid) { return D.loc.filter(function (l) { return l.Location_ID === lid; })[0]; }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function roleHas(role, p) { if ((PERMS[role] || []).indexOf(p) !== -1) return true; if (p === 'location.approve_override' && role === 'SCHEDULER') return D.settings.Scheduler_Can_Review_Overrides === 'TRUE'; if (p === 'visit.approve_family_update' && role === 'SCHEDULER') return D.settings.Scheduler_Can_Approve_Family_Updates === 'TRUE'; return false; }
  function permsFor(role) { var all = {}; Object.keys(PERMS).forEach(function (r) { PERMS[r].forEach(function (p) { all[p] = 1; }); }); return Object.keys(all).filter(function (p) { return roleHas(role, p); }).sort(); }
  function actorFrom(token) {
    var m = /^demo\.(EMP_\w+)$/.exec(token || ''); if (!m) throw AuthE('Invalid session. Please sign in again.');
    var e = E(m[1]); if (!e || e.Employment_Status !== 'ACTIVE') throw AuthE('This account is no longer active. Contact your administrator.');
    return { employeeId: e.Employee_ID, email: e.Email, role: e.Role, permissions: permsFor(e.Role), firstName: e.First_Name, lastName: e.Last_Name, workweekStartDay: D.settings.Workweek_Start_Day };
  }
  function need(token, perms) { var a = actorFrom(token); perms = [].concat(perms); if (!perms.some(function (p) { return roleHas(a.role, p); })) throw AuthE('You do not have permission to do that.'); return a; }
  function strip(s, actor) {
    var c = copy(s); var all = roleHas(actor.role, 'shift.view_all');
    if (!all) { delete c.Internal_Instructions; if (!(c.Assigned_Employee_ID === actor.employeeId && ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED'].indexOf(c.Shift_Status) !== -1)) { delete c.Location_ID; delete c.Client_ID; } }
    if (!roleHas(actor.role, 'shift.correct_completed')) { delete c.Correction_Status; delete c.Correction_Requested; }
    return c;
  }
  function withLoc(c, s) { var l = L(s.Location_ID); if (l && c.Location_ID) { c.Location_Label = l.Location_Label; c.Street_Address = l.Street_Address; } return c; }
  function overlap(eid, s, ex) { var t = times(s); return D.shifts.some(function (o) { if (o.Shift_ID === ex || o.Assigned_Employee_ID !== eid || ['ASSIGNED', 'IN_PROGRESS'].indexOf(o.Shift_Status) === -1) return false; var u = times(o); return t.start < u.end && u.start < t.end; }); }
  function hasAvail(eid, s) { return D.avail.some(function (a) { return a.Employee_ID === eid && a.Date === s.Shift_Date && a.Availability_Status === 'AVAILABLE'; }); }
  function missingQ(eid, s) { return String(s.Required_Qualifications || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean).filter(function (q) { return !D.quals.some(function (r) { return r.Employee_ID === eid && r.Qualification_Type.toLowerCase() === q.toLowerCase() && r.Verification_Status === 'VERIFIED' && r.Expiration_Date >= T; }); }); }
  function inRange(d, f) { return (!f.dateFrom || d >= f.dateFrom) && (!f.dateTo || d <= f.dateTo); }
  function sortShifts(a, b) { return (a.Shift_Date + a.Start_Time).localeCompare(b.Shift_Date + b.Start_Time); }
  function wallToIso(v) { if (!v) return ''; var m = /^(\d{4}-\d\d-\d\d)T(\d\d:\d\d)/.exec(v); if (/[+-]\d\d:\d\d$|Z$/.test(v)) return iso(v); return m ? iso(at(m[1], m[2])) : iso(v); }
  function assign(actor, s, eid, reason) {
    if (overlap(eid, s, s.Shift_ID)) throw V('Employee already has an overlapping assigned shift.');
    var w = [];
    var mq = missingQ(eid, s); if (mq.length) w.push('Missing or expired qualification(s): ' + mq.join(', '));
    if (!hasAvail(eid, s)) w.push('Employee has not marked availability for this date/time.');
    if (w.length && !reason) return { ok: false, warnings: w };
    var prev = s.Assigned_Employee_ID;
    s.Assigned_Employee_ID = eid; s.Shift_Status = 'ASSIGNED'; s.Published_As_Open = false;
    if (prev && prev !== eid) notify(prev, 'Caregiver assignment changed', 'You are no longer assigned to the shift on ' + s.Shift_Date + '.', s.Shift_ID);
    notify(eid, 'Shift assigned', 'You have been assigned a shift on ' + s.Shift_Date + ' (' + s.Start_Time + '-' + s.End_Time + ').', s.Shift_ID);
    audit(actor, 'SHIFT_ASSIGNED', 'Shift', s.Shift_ID, reason);
    return { ok: true };
  }
  function evalGps(s, gps) {
    var out = { result: 'GPS_UNAVAILABLE', resultCode: 'LOCATION_UNAVAILABLE', radiusMiles: Number(s.Geofence_Radius_Miles || D.settings.Geofence_Radius_Miles), distanceMiles: '', accuracy: '', maximumAccuracy: 100, attemptId: gps && gps.attemptId };
    if (!gps) return out;
    if (gps.error === 'PERMISSION_DENIED') { out.result = 'PERMISSION_DENIED'; return out; }
    if (gps.error) { out.resultCode = gps.error === 'TIMEOUT' ? 'LOCATION_TIMEOUT' : 'LOCATION_UNAVAILABLE'; return out; }
    out.accuracy = gps.accuracy;
    if (gps.accuracy > 100) { out.result = 'ACCURACY_INSUFFICIENT'; out.resultCode = 'LOW_GPS_ACCURACY'; return out; }
    // Demo: you are not really at the client's home, so any good reading counts as inside.
    out.result = 'APPROVED'; out.resultCode = 'INSIDE_AUTHORIZED_RADIUS'; out.distanceMiles = 0.04; return out;
  }
  function gpsMsg(type, r) {
    if (r.result === 'APPROVED') return 'Location verified. (Demo: any accurate reading is accepted.)';
    if (type === 'CLOCK_OUT') return 'Your clock-out time was recorded, but your location could not be verified, so a supervisor will review this entry.';
    if (r.result === 'PERMISSION_DENIED') return 'Location access is required to verify your location when clocking in or out.';
    if (r.result === 'ACCURACY_INSUFFICIENT') return 'We couldn’t get a precise enough location. Move near a window or outdoors and try again.';
    if (r.resultCode === 'LOCATION_TIMEOUT') return 'Location verification timed out. Please try again near a window or outdoors.';
    return 'We couldn’t get a current location from your device. Make sure Location Services are on and try again.';
  }
  function recordEvent(actor, s, type, r, teId) { var e = { Event_ID: id('CEV'), Attempt_ID: r.attemptId || '', Server_Timestamp: iso(n()), Employee_ID: actor.employeeId, Shift_ID: s.Shift_ID, Event_Type: type, Distance_Miles: r.distanceMiles, GPS_Accuracy_Meters: r.accuracy, Allowed_Radius_Miles: r.radiusMiles, Result: r.result, Detail: '', Time_Entry_ID: teId || '' }; D.events.unshift(e); return e; }
  function teRow(t, actor) {
    var c = copy(t), s = D.shifts.filter(function (x) { return x.Shift_ID === t.Shift_ID; })[0];
    c.Employee_Name = name(t.Employee_ID);
    if (s) { c.Shift_Date = s.Shift_Date; c.Start_Time = s.Start_Time; c.End_Time = s.End_Time; if (actor && roleHas(actor.role, 'shift.correct_completed')) { c.Completed_Shift = s.Shift_Status === 'COMPLETED'; c.Correction_Pending = ['PENDING_REAPPROVAL', 'CORRECTION_REQUIRED'].indexOf(s.Correction_Status) !== -1; } }
    return c;
  }
  function sum(list) { return Math.round(list.reduce(function (a, e) { return a + (['SUBMITTED', 'EXCEPTION', 'APPROVED', 'CORRECTED'].indexOf(e.Entry_Status) !== -1 && e.Total_Hours ? Number(e.Total_Hours) : 0); }, 0) * 100) / 100; }
  function weekStart() { var d = new Date(T + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.toISOString().slice(0, 10); }
  function careRow(sid) { return D.care.filter(function (c) { return c.Shift_ID === sid; })[0]; }
  function pubCare(r, mgr) { var o = { shiftId: r.Shift_ID, clientId: r.Client_ID, tasks: r.Tasks_Done ? r.Tasks_Done.split(',') : [], staffNote: r.Staff_Note || '', approvalStatus: r.Approval_Status, submittedAt: r.Submitted_At }; if (mgr) { o.familyUpdate = r.Family_Update || ''; o.administrativeNote = r.Administrative_Note || ''; } return o; }
  function ctxState(s) {
    var e = D.te.filter(function (t) { return t.Shift_ID === s.Shift_ID; })[0] || {}, v = careRow(s.Shift_ID) || {};
    return { Shift_Status: s.Shift_Status, Pay_Type: s.Pay_Type, Internal_Instructions: s.Internal_Instructions, Assigned_Employee_ID: s.Assigned_Employee_ID, Client_ID: s.Client_ID, Location_ID: s.Location_ID, Shift_Date: s.Shift_Date, Start_Time: s.Start_Time, End_Time: s.End_Time,
      Time_Entry_ID: e.Time_Entry_ID || '', Employee_ID: e.Employee_ID || '', Clock_In_Time: e.Clock_In_Time || '', Clock_Out_Time: e.Clock_Out_Time || '', Total_Hours: e.Total_Hours || '', Entry_Status: e.Entry_Status || '', Clock_In_Geofence_Status: e.Clock_In_Geofence_Status || '', Clock_Out_Geofence_Status: e.Clock_Out_Geofence_Status || '',
      Staff_Note: v.Staff_Note || '', Administrative_Note: v.Administrative_Note || '', Family_Update: v.Family_Update || '', Tasks_Done: v.Tasks_Done || '', Approval_Status: v.Approval_Status || '', Correction_Status: s.Correction_Status || 'COMPLETED' };
  }
  function snapshot(s) { return 'v' + (s.Correction_Version || 0) + '-' + JSON.stringify(ctxState(s)).length; }

  /* ---------------- handlers ---------------- */
  var codes = {};
  var H_ = {
    api_requestLoginCode: function (email) { codes['s:' + String(email).toLowerCase()] = true; return { ok: true, message: 'Demo: use code 123456.' }; },
    api_requestFamilyLoginCode: function (email) { codes['f:' + String(email).toLowerCase()] = true; return { ok: true, message: 'Demo: use code 123456.' }; },
    api_verifyLoginCode: function (email, code) {
      if (String(code) !== '123456') throw V('Incorrect code. 4 attempt(s) remaining.');
      var e = D.emp.filter(function (x) { return x.Email === String(email).trim().toLowerCase() && x.Employment_Status === 'ACTIVE'; })[0];
      if (!e) throw V('That code has expired. Request a new one.');
      audit({ email: e.Email, employeeId: e.Employee_ID, role: e.Role }, 'LOGIN_SUCCESS', 'Auth');
      return { token: 'demo.' + e.Employee_ID, employee: { employeeId: e.Employee_ID, firstName: e.First_Name, lastName: e.Last_Name, role: e.Role, permissions: permsFor(e.Role), workweekStartDay: 'Sunday' } };
    },
    api_verifyFamilyLoginCode: function (email, code) {
      if (String(code) !== '123456') throw V('Incorrect code. 4 attempt(s) remaining.');
      var c = D.contacts.filter(function (x) { return x.Email === String(email).trim().toLowerCase() && x.Active_Status === 'TRUE'; })[0];
      if (!c) throw V('That code has expired. Request a new one.');
      return { token: 'family.' + c.Email };
    },
    api_signOut: function () { return { ok: true }; },
    api_getCurrentSession: function (t) { return actorFrom(t); },
    api_getBatch: function (t, parts) { actorFrom(t); return parts.map(function (p) { try { return { ok: true, result: H_[p[0]].apply(null, [t].concat(p[1] || [])) }; } catch (e) { return { ok: false, code: e.name === 'AuthError' ? 'AUTH_REQUIRED' : 'REQUEST_FAILED', error: e.message }; } }); },

    api_listMySchedule: function (t, f) {
      var a = need(t, 'shift.view_own'); f = f || {};
      return D.shifts.filter(function (s) { return s.Assigned_Employee_ID === a.employeeId && s.Shift_Status !== 'CANCELLED' && ((f.dashboard && s.Shift_Status === 'IN_PROGRESS') || inRange(s.Shift_Date, f)); }).sort(sortShifts)
        .map(function (s) { var c = withLoc(strip(s, a), s), tm = times(s); c.Can_Clock_In = s.Shift_Status === 'ASSIGNED' && n() <= tm.end; c.Clock_In_Overdue = s.Shift_Status === 'ASSIGNED' && n() > tm.start; return c; });
    },
    api_listOpenShifts: function (t) {
      var a = need(t, 'shift.view_open');
      return D.shifts.filter(function (s) { return ['OPEN', 'REQUESTED'].indexOf(s.Shift_Status) !== -1 && s.Published_As_Open && !s.Assigned_Employee_ID && times(s).start > n() && !missingQ(a.employeeId, s).length && hasAvail(a.employeeId, s) && !overlap(a.employeeId, s); })
        .sort(sortShifts).map(function (s) { var c = strip(s, a); c.AlreadyRequested = D.req.some(function (r) { return r.Shift_ID === s.Shift_ID && r.Employee_ID === a.employeeId && r.Request_Status === 'PENDING'; }); return c; });
    },
    api_requestShift: function (t, sid) {
      var a = need(t, 'shift.request'), s = S(sid);
      if (!hasAvail(a.employeeId, s)) throw V('Mark yourself available for this date/time before requesting the shift.');
      var r = { Request_ID: id('REQ'), Shift_ID: sid, Employee_ID: a.employeeId, Request_Status: 'PENDING', Requested_At: iso(n()), Reviewed_By: '', Reviewed_At: '', Management_Note: '' };
      D.req.push(r); if (s.Shift_Status === 'OPEN') s.Shift_Status = 'REQUESTED';
      D.emp.filter(function (e) { return e.Role !== 'CAREGIVER'; }).forEach(function (m) { notify(m.Employee_ID, 'New shift request', a.firstName + ' ' + a.lastName + ' requested the shift on ' + s.Shift_Date + '.', sid); });
      audit(a, 'SHIFT_REQUEST_CREATED', 'Shift_Request', r.Request_ID); return r;
    },
    api_withdrawShiftRequest: function (t, rid) { var a = need(t, 'shift.request'); var r = D.req.filter(function (x) { return x.Request_ID === rid && x.Employee_ID === a.employeeId; })[0]; if (!r) throw V('Request not found.'); r.Request_Status = 'WITHDRAWN'; var s = S(r.Shift_ID); if (s.Shift_Status === 'REQUESTED' && !D.req.some(function (x) { return x.Shift_ID === s.Shift_ID && x.Request_Status === 'PENDING'; })) s.Shift_Status = 'OPEN'; return { ok: true }; },
    api_clockIn: function (t, sid, gps) {
      var a = need(t, 'attendance.clock_in'), s = S(sid);
      if (s.Assigned_Employee_ID !== a.employeeId) throw V('Only the assigned caregiver can clock in to this shift.');
      if (D.te.some(function (e) { return e.Employee_ID === a.employeeId && e.Clock_In_Time && !e.Clock_Out_Time; })) throw V('You are already clocked in to another shift. Clock out first.');
      var r = evalGps(s, gps);
      if (r.result !== 'APPROVED') { var ev = recordEvent(a, s, 'CLOCK_IN', r); return { ok: false, status: r.result, resultCode: r.resultCode, eventId: ev.Event_ID, message: gpsMsg('CLOCK_IN', r), distanceMiles: r.distanceMiles, radiusMiles: r.radiusMiles, accuracyMeters: r.accuracy, maximumAccuracyMeters: 100, canRetry: true }; }
      var late = (n() - times(s).start) / 60000 > 10;
      var e = { Time_Entry_ID: id('TE'), Shift_ID: sid, Employee_ID: a.employeeId, Clock_In_Time: iso(n()), Clock_In_Accuracy: r.accuracy, Clock_In_Distance_Meters: 60, Clock_In_Geofence_Status: 'INSIDE', Clock_Out_Time: '', Clock_Out_Geofence_Status: '', Total_Hours: '', Entry_Status: late ? 'EXCEPTION' : 'OPEN' };
      D.te.push(e); s.Shift_Status = 'IN_PROGRESS'; recordEvent(a, s, 'CLOCK_IN', r, e.Time_Entry_ID); audit(a, 'CLOCK_IN', 'Time_Entry', e.Time_Entry_ID);
      return { ok: true, status: 'APPROVED', message: 'Location verified.', clockInTime: e.Clock_In_Time, distanceMiles: r.distanceMiles, radiusMiles: r.radiusMiles, entry: e };
    },
    api_clockOut: function (t, sid, gps) {
      var a = need(t, 'attendance.clock_out'), s = S(sid);
      var e = D.te.filter(function (x) { return x.Shift_ID === sid && x.Employee_ID === a.employeeId && !x.Clock_Out_Time; })[0];
      if (!e) throw V('You do not have an open clock-in for this shift.');
      var r = evalGps(s, gps), ok = r.result === 'APPROVED';
      e.Clock_Out_Time = iso(n()); e.Clock_Out_Geofence_Status = ok ? 'INSIDE' : 'UNAVAILABLE'; e.Total_Hours = Math.max(0.01, Math.round((n() - new Date(e.Clock_In_Time)) / 36e3) / 100);
      e.Entry_Status = (!ok || e.Entry_Status === 'EXCEPTION') ? 'EXCEPTION' : 'SUBMITTED'; s.Shift_Status = 'COMPLETED';
      var ev = recordEvent(a, s, 'CLOCK_OUT', r, e.Time_Entry_ID); audit(a, 'CLOCK_OUT', 'Time_Entry', e.Time_Entry_ID);
      return { ok: true, status: r.result, flagged: !ok, eventId: ev.Event_ID, message: gpsMsg('CLOCK_OUT', r), clockOutTime: e.Clock_Out_Time, totalHours: e.Total_Hours, distanceMiles: r.distanceMiles, radiusMiles: r.radiusMiles, accuracyMeters: r.accuracy, maximumAccuracyMeters: 100 };
    },
    api_requestLocationOverride: function (t, evId, text) { var a = need(t, 'location.request_override'); if (!text || text.length < 5) throw V('Please tell your reviewer why you need this reviewed.'); var ev = D.events.filter(function (e) { return e.Event_ID === evId; })[0]; D.ovReq.push({ Request_ID: id('GRQ'), Event_ID: evId, Employee_ID: a.employeeId, Shift_ID: ev.Shift_ID, Reason_Text: text, Requested_At: iso(n()) }); audit(a, 'LOCATION_OVERRIDE_REQUESTED', 'Clock_Event', evId, text); return { ok: true }; },
    api_reportTimeProblem: function (t, p) {
      var a = need(t, 'attendance.report_problem'), s = S(p.Shift_ID);
      var e = D.te.filter(function (x) { return x.Shift_ID === s.Shift_ID && x.Employee_ID === a.employeeId; })[0];
      if (!e) { e = { Time_Entry_ID: id('TE'), Shift_ID: s.Shift_ID, Employee_ID: a.employeeId, Clock_In_Time: '', Clock_Out_Time: '', Total_Hours: '', Entry_Status: 'EXCEPTION' }; D.te.push(e); }
      var r = { Correction_Request_ID: id('COR'), Time_Entry_ID: e.Time_Entry_ID, Employee_ID: a.employeeId, Requested_Clock_In: p.Requested_Clock_In ? wallToIso(p.Requested_Clock_In) : '', Requested_Clock_Out: p.Requested_Clock_Out ? wallToIso(p.Requested_Clock_Out) : '', Reason: '[' + p.Problem_Type + '] ' + p.Reason, Request_Status: 'PENDING', Submitted_At: iso(n()) };
      D.corr.unshift(r); audit(a, 'CORRECTION_REQUEST_SUBMITTED', 'Time_Correction_Request', r.Correction_Request_ID); return r;
    },
    api_getMyHours: function (t, o) {
      var a = need(t, 'timesheet.view_own');
      var list = D.te.filter(function (e) { return e.Employee_ID === a.employeeId; }).map(function (e) { return teRow(e); }).sort(function (x, y) { return y.Shift_Date.localeCompare(x.Shift_Date); });
      var ws = weekStart(), we = addDays(ws, 7);
      var wk = list.filter(function (e) { return e.Shift_Date >= ws && e.Shift_Date < we; });
      return { weeklyHours: sum(wk), payPeriodHours: sum(wk), entries: o && o.summaryOnly ? [] : list };
    },
    api_listMyAvailability: function (t) { var a = need(t, 'availability.manage_own'); return copy(D.avail.filter(function (x) { return x.Employee_ID === a.employeeId; }).sort(function (x, y) { return x.Date.localeCompare(y.Date); })); },
    api_listEmployeeAvailability: function (t, eid) { need(t, 'availability.view_all'); return copy(D.avail.filter(function (x) { return x.Employee_ID === eid; }).sort(function (x, y) { return x.Date.localeCompare(y.Date); })); },
    api_createAvailability: function (t, p) { var a = need(t, 'availability.manage_own'); if (p.Date < T) throw V('Only today or a future date can be set.'); if (!!p.Available_From !== !!p.Available_To) throw V('Enter both a start and an end time, or leave both blank for all-day.'); var r = Object.assign({ Availability_ID: id('AVL'), Employee_ID: a.employeeId }, p); D.avail.push(r); return r; },
    api_updateAvailability: function (t, aid, p) { var a = need(t, 'availability.manage_own'); var r = D.avail.filter(function (x) { return x.Availability_ID === aid && x.Employee_ID === a.employeeId; })[0]; if (!r) throw V('Availability entry not found.'); Object.assign(r, p); return { ok: true }; },
    api_listMyNotifications: function (t) { var a = need(t, 'notification.view_own'); return copy(D.notes.filter(function (x) { return x.Recipient_Employee_ID === a.employeeId; })); },
    api_markNotificationRead: function (t, nid) { var a = need(t, 'notification.view_own'); D.notes.forEach(function (x) { if (x.Notification_ID === nid && x.Recipient_Employee_ID === a.employeeId) { x.Read_Status = true; x.Read_At = iso(n()); } }); return { ok: true }; },
    api_countUnreadNotifications: function (t) { var a = need(t, 'notification.view_own'); return D.notes.filter(function (x) { return x.Recipient_Employee_ID === a.employeeId && !x.Read_Status; }).length; },
    api_getMyProfile: function (t) { var a = need(t, 'profile.view_own'); var c = copy(E(a.employeeId)); if (!roleHas(a.role, 'staff.view_pay') && D.settings.Show_Hourly_Rate_To_Caregiver !== 'TRUE') delete c.Hourly_Rate; return c; },
    api_getVisitCare: function (t, sid) {
      var a = need(t, ['visit.record_own', 'visit.view_all']), s = S(sid), mgr = roleHas(a.role, 'visit.view_all'), r = careRow(sid);
      var o = r ? pubCare(r, mgr) : { shiftId: sid, clientId: s.Client_ID, tasks: [], staffNote: '', approvalStatus: '', submittedAt: '' };
      o.hasClient = !!s.Client_ID; o.readOnly = !mgr && s.Shift_Status === 'COMPLETED' && !!r; o.availableTasks = TASKS.slice(); return o;
    },
    api_saveVisitCare: function (t, sid, tasks, note) {
      var a = need(t, 'visit.record_own'), s = S(sid);
      if (['IN_PROGRESS', 'COMPLETED'].indexOf(s.Shift_Status) === -1) throw V('Record care after you have clocked in.');
      var r = careRow(sid); if (!r) { r = { Shift_ID: sid }; D.care.push(r); }
      Object.assign(r, { Client_ID: s.Client_ID, Tasks_Done: (tasks || []).join(','), Staff_Note: note || '', Approval_Status: 'PENDING', Submitted_By: a.employeeId, Submitted_At: iso(n()) });
      audit(a, 'VISIT_CARE_SUBMITTED', 'Visit_Care', sid); return pubCare(r);
    },
    api_listQualifications: function (t, eid) { var a = need(t, ['qualification.view_own', 'qualification.view_all']); if (eid !== a.employeeId && !roleHas(a.role, 'qualification.view_all')) throw AuthE('You can only view your own qualifications.'); return copy(D.quals.filter(function (q) { return q.Employee_ID === eid; })); },

    /* management */
    api_getManagementSummary: function (t) {
      var a = need(t, 'summary.view_operations'), td = D.shifts.filter(function (s) { return s.Shift_Date === T; });
      var open = D.te.filter(function (e) { return e.Clock_In_Time && !e.Clock_Out_Time; });
      var s = { role: a.role, scheduledToday: td.filter(function (x) { return x.Assigned_Employee_ID && x.Shift_Status !== 'CANCELLED'; }).length, upcomingToday: 0, unassignedShifts: D.shifts.filter(function (x) { return x.Shift_Date >= T && !x.Assigned_Employee_ID && ['CANCELLED', 'COMPLETED'].indexOf(x.Shift_Status) === -1; }).length,
        pendingLocationOverrides: roleHas(a.role, 'location.view_status') ? H_.api_listClockEvents(t, {}).filter(function (e) { return e.Needs_Review; }).length : 0,
        todaysShifts: td.length, openShifts: D.shifts.filter(function (x) { return x.Shift_Status === 'OPEN'; }).length, pendingRequests: D.req.filter(function (r) { return r.Request_Status === 'PENDING'; }).length,
        currentlyClockedIn: open.length, lateClockIns: D.shifts.filter(function (x) { return x.Shift_Status === 'ASSIGNED' && x.Shift_Date === T && times(x).start < n() - 600e3; }).length,
        missingClockOuts: open.filter(function (e) { return times(S(e.Shift_ID)).end < n(); }).length, qualificationsExpiringSoon: D.quals.filter(function (q) { return q.Verification_Status === 'VERIFIED' && q.Expiration_Date <= addDays(T, 30); }).length };
      if (roleHas(a.role, 'visit.approve_family_update')) s.pendingFamilyUpdates = D.care.filter(function (c) { return c.Approval_Status === 'PENDING'; }).length;
      if (roleHas(a.role, 'summary.view_payroll')) s.pendingTimesheetApprovals = D.te.filter(function (e) { return ['SUBMITTED', 'EXCEPTION', 'CORRECTED'].indexOf(e.Entry_Status) !== -1 && e.Clock_Out_Time; }).length;
      return s;
    },
    api_listShiftsForManagement: function (t, f) {
      var a = need(t, 'shift.view_all'); f = f || {};
      return D.shifts.filter(function (s) { return inRange(s.Shift_Date, f) && (!f.status || s.Shift_Status === f.status) && (!f.employeeId || s.Assigned_Employee_ID === f.employeeId) && (!f.unassigned || !s.Assigned_Employee_ID); })
        .sort(sortShifts).map(function (s) { var c = strip(s, a), l = L(s.Location_ID); if (l) { c.Location_Label = l.Location_Label; c.Street_Address = l.Street_Address; c.General_Service_Area = l.General_Service_Area; } if (s.Assigned_Employee_ID) c.Assigned_Employee_Name = name(s.Assigned_Employee_ID); return c; });
    },
    api_createShift: function (t, p) {
      var a = need(t, 'shift.create'); if (p.Shift_Date < T) throw V('Shift date cannot be in the past.'); var l = L(p.Location_ID); if (!l) throw V('Selected service location was not found.');
      var s = shift(p.Shift_Date, p.Start_Time, p.End_Time, l, '', 'DRAFT', { Pay_Type: p.Pay_Type, Required_Qualifications: p.Required_Qualifications || '', Internal_Instructions: p.Internal_Instructions || '', Client_ID: p.Client_ID || '', Geofence_Radius_Miles: p.Geofence_Radius_Miles || '' });
      audit(a, 'SHIFT_CREATED', 'Shift', s.Shift_ID); return copy(s);
    },
    api_editShift: function (t, sid, p) { var a = need(t, 'shift.edit'), s = S(sid); Object.assign(s, p); if (p.Location_ID) s.General_Service_Area = L(p.Location_ID).General_Service_Area; if (s.Assigned_Employee_ID) notify(s.Assigned_Employee_ID, 'Shift updated', 'Your shift on ' + s.Shift_Date + ' has changed.', sid); audit(a, 'SHIFT_UPDATED', 'Shift', sid, '', null, p); return { ok: true }; },
    api_cancelShift: function (t, sid, reason) { var a = need(t, 'shift.edit'), s = S(sid); if (!reason) throw V('A reason is required to cancel a shift.'); s.Shift_Status = 'CANCELLED'; if (s.Assigned_Employee_ID) notify(s.Assigned_Employee_ID, 'Shift cancelled', 'Your shift on ' + s.Shift_Date + ' was cancelled. Reason: ' + reason, sid); audit(a, 'SHIFT_CANCELLED', 'Shift', sid, reason); return { ok: true }; },
    api_publishShiftOpen: function (t, sid) { var a = need(t, 'shift.create'), s = S(sid); s.Shift_Status = 'OPEN'; s.Published_As_Open = true; audit(a, 'SHIFT_PUBLISHED', 'Shift', sid); return { ok: true }; },
    api_assignShift: function (t, sid, eid, reason) { return assign(need(t, 'shift.assign'), S(sid), eid, reason); },
    api_listShiftRequests: function (t, sid) { need(t, 'shift.approve_request'); return D.req.filter(function (r) { return !sid || r.Shift_ID === sid; }).map(function (r) { var c = copy(r); c.Employee_Name = name(r.Employee_ID); return c; }); },
    api_approveShiftRequest: function (t, rid, note) {
      var a = need(t, 'shift.approve_request'), r = D.req.filter(function (x) { return x.Request_ID === rid; })[0];
      if (!r || r.Request_Status !== 'PENDING') throw V('This request has already been reviewed.');
      var res = assign(a, S(r.Shift_ID), r.Employee_ID, note); if (!res.ok) return res;
      r.Request_Status = 'APPROVED'; r.Reviewed_By = a.email; r.Reviewed_At = iso(n()); r.Management_Note = note || '';
      D.req.forEach(function (x) { if (x.Shift_ID === r.Shift_ID && x.Request_Status === 'PENDING') { x.Request_Status = 'REJECTED'; x.Management_Note = 'Shift filled.'; } });
      return { ok: true };
    },
    api_rejectShiftRequest: function (t, rid, note) { var a = need(t, 'shift.approve_request'), r = D.req.filter(function (x) { return x.Request_ID === rid; })[0]; r.Request_Status = 'REJECTED'; r.Management_Note = note || ''; notify(r.Employee_ID, 'Shift request not approved', 'Your shift request was not approved.' + (note ? ' Note: ' + note : ''), r.Shift_ID); var s = S(r.Shift_ID); if (s.Shift_Status === 'REQUESTED' && !D.req.some(function (x) { return x.Shift_ID === s.Shift_ID && x.Request_Status === 'PENDING'; })) s.Shift_Status = 'OPEN'; audit(a, 'SHIFT_REQUEST_REJECTED', 'Shift_Request', rid, note); return { ok: true }; },
    api_listLocations: function (t) { need(t, 'shift.view_all'); return D.loc.map(function (l) { var c = copy(l); c.Edit_Version = 'v1'; return c; }); },
    api_getAddressCandidates: function (t, addr) { need(t, 'site.manage'); if (!addr || addr.length < 8) throw V('Enter the full street address, city, state and ZIP code.'); return { lookupId: 'demo-lookup-0000000000000000', candidates: [{ address: addr.replace(/\s+/g, ' ') + (/USA$/.test(addr) ? '' : ', USA'), latitude: 39.4, longitude: -76.6, precision: 'ROOFTOP' }] }; },
    api_getLocationMap: function () { var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect width="600" height="300" fill="#e8efe4"/><path d="M0 150h600M300 0v300M0 60l600 160" stroke="#fff" stroke-width="14"/><circle cx="300" cy="140" r="14" fill="#b3261e"/><text x="300" y="285" font-family="Arial" font-size="16" text-anchor="middle" fill="#55504b">Demo map preview</text></svg>'; return { image: 'data:image/svg+xml;base64,' + btoa(svg) }; },
    api_createLocation: function (t, p) { var a = need(t, 'site.manage'); var l = loc(p.Location_Label, p.General_Service_Area, p.Street_Address, 39.4, -76.6); l.Geofence_Radius_Miles = p.Geofence_Radius_Miles || ''; audit(a, 'LOCATION_CREATED', 'Service_Location', l.Location_ID); return copy(l); },
    api_editLocation: function (t, lid, p) { var a = need(t, 'site.manage'), l = L(lid); Object.assign(l, { Location_Label: p.Location_Label, General_Service_Area: p.General_Service_Area, Street_Address: p.Street_Address, Geofence_Radius_Miles: p.Geofence_Radius_Miles || '' }); audit(a, 'LOCATION_UPDATED', 'Service_Location', lid); return { ok: true, locationId: lid }; },
    api_setLocationActive: function (t, lid, on) { need(t, 'site.manage'); L(lid).Active_Status = !!on; return { ok: true }; },
    api_setLocationRadius: function (t, lid, m) { need(t, 'site.manage'); L(lid).Geofence_Radius_Miles = m || ''; return { ok: true }; },
    api_listTimeEntries: function (t, f) { var a = need(t, 'attendance.view_all'); f = f || {}; return D.te.map(function (e) { return teRow(e, a); }).filter(function (e) { return inRange(e.Shift_Date, f) && (!f.status || e.Entry_Status === f.status) && (!f.employeeId || e.Employee_ID === f.employeeId); }); },
    api_approveTimeEntry: function (t, tid) { var a = need(t, 'timesheet.approve'), e = D.te.filter(function (x) { return x.Time_Entry_ID === tid; })[0]; e.Entry_Status = 'APPROVED'; e.Approved_By = a.email; e.Approved_At = iso(n()); notify(e.Employee_ID, 'Timesheet entry approved', 'A time entry on your timesheet was approved.', tid); audit(a, 'TIMESHEET_APPROVED', 'Time_Entry', tid); return { ok: true }; },
    api_rejectTimeEntry: function (t, tid, why) { var a = need(t, 'timesheet.approve'), e = D.te.filter(function (x) { return x.Time_Entry_ID === tid; })[0]; e.Entry_Status = 'REJECTED'; audit(a, 'TIME_ENTRY_REJECTED', 'Time_Entry', tid, why); return { ok: true }; },
    api_correctTimeEntry: function (t, tid, p, why) { var a = need(t, 'time.correct'), e = D.te.filter(function (x) { return x.Time_Entry_ID === tid; })[0]; if (!why) throw V('A correction reason is required.'); if (S(e.Shift_ID).Shift_Status === 'COMPLETED') throw V('Use Completed Shift Details to correct this entry.'); e.Clock_In_Time = p.Clock_In_Time; e.Clock_Out_Time = p.Clock_Out_Time; e.Total_Hours = Math.round((new Date(p.Clock_Out_Time) - new Date(p.Clock_In_Time)) / 36e3) / 100; e.Entry_Status = 'CORRECTED'; e.Correction_Reason = why; e.Corrected_By = a.email; audit(a, 'TIME_ENTRY_CORRECTED', 'Time_Entry', tid, why); return { ok: true }; },
    api_approveTimesheet: function (t, eid, from, to) { var a = need(t, 'timesheet.approve'), k = 0; D.te.forEach(function (e) { var s = S(e.Shift_ID); if (e.Employee_ID === eid && e.Clock_Out_Time && ['SUBMITTED', 'EXCEPTION', 'CORRECTED'].indexOf(e.Entry_Status) !== -1 && s.Shift_Date >= from && s.Shift_Date <= to) { e.Entry_Status = 'APPROVED'; e.Approved_By = a.email; k++; } }); return { ok: true, approvedCount: k }; },
    api_listCorrectionRequests: function (t) { need(t, 'timesheet.review'); return D.corr.map(function (c) { var o = copy(c), e = D.te.filter(function (x) { return x.Time_Entry_ID === c.Time_Entry_ID; })[0]; o.Employee_Name = name(c.Employee_ID); if (e && S(e.Shift_ID).Shift_Status === 'COMPLETED') o.Completed_Shift_ID = e.Shift_ID; return o; }); },
    api_resolveCorrectionRequest: function (t, cid, approve, resp) { var a = need(t, 'time.correct'), c = D.corr.filter(function (x) { return x.Correction_Request_ID === cid; })[0]; c.Request_Status = approve ? 'APPROVED' : 'REJECTED'; c.Management_Response = resp || ''; c.Reviewed_By = a.email; notify(c.Employee_ID, 'Time correction ' + (approve ? 'approved' : 'declined'), resp || '', c.Time_Entry_ID); return { ok: true }; },
    api_listClockEvents: function (t, f) {
      var a = need(t, 'location.view_status'); f = f || {}; var mayDecide = roleHas(a.role, 'location.approve_override');
      var rows = D.events.map(function (e) {
        var o = D.overrides.filter(function (x) { return x.Event_ID === e.Event_ID; })[0], q = D.ovReq.filter(function (x) { return x.Event_ID === e.Event_ID; })[0], s = S(e.Shift_ID);
        var clocked = e.Event_Type === 'CLOCK_IN' && D.te.some(function (x) { return x.Shift_ID === e.Shift_ID && x.Clock_In_Time; });
        var needs = !o && e.Result !== 'APPROVED' && !clocked;
        return Object.assign(copy(e), { Employee_Name: name(e.Employee_ID), Shift_Date: s.Shift_Date, Start_Time: s.Start_Time, End_Time: s.End_Time, Category: e.Result === 'APPROVED' ? 'VERIFIED' : o ? (o.Decision === 'APPROVED' ? 'OVERRIDDEN' : 'DENIED') : (e.Result === 'BLOCKED' ? 'BLOCKED' : 'GPS_ISSUE'),
          Override_Decision: o ? o.Decision : '', Override_Reason: o ? o.Reason : '', Override_By: o ? o.By : '', Override_At: o ? o.At : '', Override_Requested: !!q, Override_Request_Reason: q ? q.Reason_Text : '', Needs_Review: needs, Can_Override: mayDecide && needs && e.Employee_ID !== a.employeeId });
      });
      if (f.requestedOnly) rows = rows.filter(function (r) { return r.Override_Requested && r.Can_Override; });
      return rows;
    },
    api_overrideClockEvent: function (t, evId, decision, cat, text) {
      var a = need(t, 'location.approve_override'), e = D.events.filter(function (x) { return x.Event_ID === evId; })[0];
      if (cat === 'OTHER' && !text) throw V('Please describe the reason when choosing "Other".');
      D.overrides.push({ Event_ID: evId, Decision: decision, Reason: cat.replace(/_/g, ' ').toLowerCase() + (text ? ' — ' + text : ''), By: a.firstName + ' ' + a.lastName, At: iso(n()) });
      if (decision === 'APPROVED' && e.Event_Type === 'CLOCK_IN') { var s = S(e.Shift_ID); D.te.push({ Time_Entry_ID: id('TE'), Shift_ID: s.Shift_ID, Employee_ID: e.Employee_ID, Clock_In_Time: e.Server_Timestamp, Clock_In_Geofence_Status: 'OUTSIDE', Clock_Out_Time: '', Total_Hours: '', Entry_Status: 'OPEN' }); s.Shift_Status = 'IN_PROGRESS'; }
      notify(e.Employee_ID, 'Location review: ' + decision.toLowerCase(), 'Your ' + e.Event_Type.replace('_', '-').toLowerCase() + ' was ' + decision.toLowerCase() + '.', e.Shift_ID);
      audit(a, 'GEOFENCE_OVERRIDE_' + decision, 'Clock_Event', evId, text); return { ok: true, decision: decision };
    },
    api_exportPayrollCsv: function (t, f) {
      var a = need(t, 'timesheet.export'); f = f || {};
      var rows = D.te.filter(function (e) { var s = S(e.Shift_ID); return e.Clock_Out_Time && (f.approvedOnly === false || e.Entry_Status === 'APPROVED') && (!f.employeeId || e.Employee_ID === f.employeeId) && (!f.periodStart || s.Shift_Date >= f.periodStart) && (!f.periodEnd || s.Shift_Date <= f.periodEnd); });
      var lines = ['Employee ID,Employee name,Shift date,Clock-in time,Clock-out time,Regular hours,Overtime-warning hours,Time-entry status,Manager approval,Approval date'];
      rows.forEach(function (e) { lines.push([e.Employee_ID, name(e.Employee_ID), S(e.Shift_ID).Shift_Date, e.Clock_In_Time, e.Clock_Out_Time, e.Total_Hours, 0, e.Entry_Status, e.Entry_Status === 'APPROVED' ? 'Yes' : 'No', ''].join(',')); });
      audit(a, 'PAYROLL_EXPORTED', 'Payroll'); return { filename: 'selectives-payroll-demo.csv', csv: lines.join('\r\n'), rowCount: rows.length, heldCount: 0 };
    },
    api_listEmployees: function (t) { var a = need(t, 'staff.view_directory'); return D.emp.map(function (e) { var c = copy(e); if (!roleHas(a.role, 'staff.view_pay')) delete c.Hourly_Rate; return c; }); },
    api_getEmployee: function (t, eid) { var a = need(t, ['profile.view_own', 'staff.view_directory']); if (eid !== a.employeeId && !roleHas(a.role, 'staff.view_directory')) throw AuthE('You can only view your own profile.'); var c = copy(E(eid)); if (!roleHas(a.role, 'staff.view_pay')) delete c.Hourly_Rate; return c; },
    api_createEmployee: function (t, p) {
      var a = need(t, 'staff.manage'); if (p.Role !== 'CAREGIVER') a = need(t, 'role.manage');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.Email || '')) throw V('Email is not a valid email address.');
      if (D.emp.some(function (e) { return e.Email === p.Email.toLowerCase(); })) throw V('An employee with that email already exists.');
      var e = emp(p.First_Name, p.Last_Name, p.Email.toLowerCase(), p.Role, Number(p.Hourly_Rate || 0)); Object.assign(e, { Phone: p.Phone || '', Hire_Date: p.Hire_Date, Service_Areas: p.Service_Areas || '', Qualifications: p.Qualifications || '', Maximum_Weekly_Hours: Number(p.Maximum_Weekly_Hours || 40) });
      audit(a, 'EMPLOYEE_CREATED', 'Employee', e.Employee_ID); var c = copy(e); c.Welcome_Email_Status = 'SENT'; return c;
    },
    api_updateEmployee: function (t, eid, p) { var a = need(t, 'staff.manage'); Object.assign(E(eid), p); audit(a, 'EMPLOYEE_UPDATED', 'Employee', eid, '', null, p); return copy(E(eid)); },
    api_setEmployeeActive: function (t, eid, on, why) { var a = need(t, 'staff.manage'); if (!on && !why) throw V('A reason is required to deactivate an employee.'); E(eid).Employment_Status = on ? 'ACTIVE' : 'INACTIVE'; audit(a, on ? 'EMPLOYEE_ACTIVATED' : 'EMPLOYEE_DEACTIVATED', 'Employee', eid, why); return { ok: true }; },
    api_setEmployeeRole: function (t, eid, role) { var a = need(t, 'role.manage'); E(eid).Role = role; audit(a, 'ROLE_CHANGED', 'Employee', eid); return { ok: true }; },
    api_addQualification: function (t, p) { var a = need(t, 'qualification.manage'); var q = { Qualification_ID: id('QUAL'), Employee_ID: p.Employee_ID, Qualification_Type: p.Qualification_Type, Issue_Date: p.Issue_Date || '', Expiration_Date: p.Expiration_Date, Verification_Status: 'PENDING' }; if (!q.Expiration_Date) throw V('Expiration_Date must be in YYYY-MM-DD format.'); D.quals.push(q); audit(a, 'QUALIFICATION_ADDED', 'Qualification', q.Qualification_ID); return q; },
    api_verifyQualification: function (t, qid, ok) { need(t, 'qualification.manage'); D.quals.forEach(function (q) { if (q.Qualification_ID === qid) q.Verification_Status = ok ? 'VERIFIED' : 'REJECTED'; }); return { ok: true }; },
    api_listClients: function (t) { need(t, 'client.view_all'); return D.clients.map(function (c) { var o = copy(c); o.Active_Contacts = D.contacts.filter(function (f) { return f.Client_ID === c.Client_ID && f.Active_Status === 'TRUE'; }).length; return o; }); },
    api_saveClient: function (t, p) { var a = need(t, 'client.manage'); if (!p.Display_Name) throw V('Enter the name the family should see, for example "Mom" or "Mary".'); var c = p.Client_ID ? D.clients.filter(function (x) { return x.Client_ID === p.Client_ID; })[0] : null; if (!c) { c = { Client_ID: id('CLI') }; D.clients.push(c); } Object.assign(c, { Display_Name: p.Display_Name, Location_ID: p.Location_ID || '', Active_Status: p.Active_Status || 'TRUE' }); audit(a, 'CLIENT_SAVED', 'Client', c.Client_ID); return copy(c); },
    api_listFamilyContacts: function (t, cid) { need(t, 'family.manage'); return copy(D.contacts.filter(function (f) { return !cid || f.Client_ID === cid; })); },
    api_saveFamilyContact: function (t, p) { var a = need(t, 'family.manage'); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.Email || '')) throw V('Email is not a valid email address.'); var f = p.Contact_ID ? D.contacts.filter(function (x) { return x.Contact_ID === p.Contact_ID; })[0] : null; if (!f) { f = { Contact_ID: id('FAM'), Authorized_By: a.email }; D.contacts.push(f); } Object.assign(f, { Client_ID: p.Client_ID, Name: p.Name, Email: p.Email.toLowerCase(), Relationship: p.Relationship || '', Active_Status: p.Active_Status }); audit(a, 'FAMILY_ACCESS_GRANTED', 'Family_Contact', f.Contact_ID); return copy(f); },
    api_listPendingFamilyUpdates: function (t) { need(t, 'visit.approve_family_update'); return D.care.filter(function (c) { return c.Approval_Status === 'PENDING'; }).map(function (c) { var s = S(c.Shift_ID), o = pubCare(c, true); o.clientName = (D.clients.filter(function (x) { return x.Client_ID === c.Client_ID; })[0] || {}).Display_Name; o.caregiverName = name(s.Assigned_Employee_ID); o.shiftDate = s.Shift_Date; o.startTime = s.Start_Time; o.endTime = s.End_Time; return o; }); },
    api_approveFamilyUpdate: function (t, sid, text, tasks) { var a = need(t, 'visit.approve_family_update'), c = careRow(sid); Object.assign(c, { Approval_Status: 'APPROVED', Family_Update: text || '', Tasks_Done: (tasks || []).join(','), Approved_By: a.employeeId, Approved_At: iso(n()) }); audit(a, 'FAMILY_UPDATE_APPROVED', 'Visit_Care', sid); return pubCare(c, true); },
    api_withholdFamilyUpdate: function (t, sid, why) { var a = need(t, 'visit.approve_family_update'), c = careRow(sid); c.Approval_Status = 'WITHHELD'; audit(a, 'FAMILY_UPDATE_WITHHELD', 'Visit_Care', sid, why); return pubCare(c, true); },
    api_getFamilyView: function (t, cid) {
      var m = /^family\.(.+)$/.exec(t || ''); if (!m) throw AuthE('Your session has expired. Please sign in again.');
      var mine = D.contacts.filter(function (f) { return f.Email === m[1] && f.Active_Status === 'TRUE'; }); if (!mine.length) throw AuthE('This account is no longer active.');
      var ids = mine.map(function (f) { return f.Client_ID; }); cid = cid || ids[0];
      var clients = ids.map(function (i) { return { clientId: i, name: (D.clients.filter(function (c) { return c.Client_ID === i; })[0] || {}).Display_Name }; });
      var shifts = D.shifts.filter(function (s) { return s.Client_ID === cid && s.Assigned_Employee_ID && ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED'].indexOf(s.Shift_Status) !== -1; });
      var visits = shifts.filter(function (s) { return s.Shift_Date === T; }).sort(sortShifts).map(function (s) {
        var e = D.te.filter(function (x) { return x.Shift_ID === s.Shift_ID; })[0], c = careRow(s.Shift_ID), ok = c && c.Approval_Status === 'APPROVED', emp = E(s.Assigned_Employee_ID);
        var arr = e && e.Clock_In_Geofence_Status === 'INSIDE' ? e.Clock_In_Time : '', done = arr && e.Clock_Out_Geofence_Status === 'INSIDE' ? e.Clock_Out_Time : '';
        return { caregiver: emp.First_Name + ' ' + emp.Last_Name.charAt(0) + '.', startTime: s.Start_Time, endTime: s.End_Time, status: done ? 'COMPLETED' : arr ? 'ARRIVED' : 'SCHEDULED', arrivedAt: arr, completedAt: done, tasks: ok && c.Tasks_Done ? c.Tasks_Done.split(',') : [], update: ok ? c.Family_Update : '' };
      });
      var next = shifts.filter(function (s) { return s.Shift_Status === 'ASSIGNED' && s.Shift_Date > T; }).sort(sortShifts)[0];
      return { today: T, contactName: mine[0].Name, client: clients.filter(function (c) { return c.clientId === cid; })[0], clients: clients, visits: visits, nextVisit: next ? { date: next.Shift_Date, startTime: next.Start_Time, endTime: next.End_Time } : null, phone: D.settings.Portal_Support_Phone };
    },
    api_getCompletedShift: function (t, sid) {
      var a = need(t, 'shift.correct_completed'), s = S(sid); if (s.Shift_Status !== 'COMPLETED') throw V('Completed shift not found.');
      var pend = ['PENDING_REAPPROVAL', 'CORRECTION_REQUIRED'].indexOf(s.Correction_Status) !== -1 ? D.scHist.filter(function (h) { return h.shiftId === sid && h.type === 'PROPOSED'; })[0] : null;
      return { current: ctxState(s), version: snapshot(s), blocked: false, pending: pend ? copy(pend) : null, adjustmentRequired: !!s.Payroll_Adjustment_Required, requested: !!s.Correction_Requested, payrollExportedAt: '', priorPayrollExportPossible: false,
        references: { caregivers: D.emp.filter(function (e) { return e.Role === 'CAREGIVER'; }).map(function (e) { return { id: e.Employee_ID, label: e.First_Name + ' ' + e.Last_Name }; }), clients: D.clients.map(function (c) { return { id: c.Client_ID, label: c.Display_Name, location: c.Location_ID }; }), locations: D.loc.map(function (l) { return { id: l.Location_ID, label: l.Location_Label }; }) },
        reasons: REASONS, tasks: TASKS, actorId: a.employeeId, canSelfApprove: D.settings.Allow_Self_Approval_Shift_Corrections === 'TRUE' };
    },
    api_listShiftCorrectionHistory: function (t, sid) { need(t, 'shift.correct_completed'); return copy(D.scHist.filter(function (h) { return h.shiftId === sid; })); },
    api_getShiftCorrectionPreview: function (t, sid, ver, p) {
      need(t, 'shift.correct_completed'); var s = S(sid); if (ver !== snapshot(s)) throw V('This shift changed while you were reviewing it. Reopen it and try again.');
      var before = ctxState(s), after = Object.assign({}, before);
      Object.keys(p.patch || {}).forEach(function (k) { after[k] = /_Time$/.test(k) && /T/.test(p.patch[k]) ? wallToIso(p.patch[k]) : (k === 'Tasks_Done' ? p.patch[k].join(',') : p.patch[k]); });
      if (after.Clock_In_Time && after.Clock_Out_Time && (p.patch.Clock_In_Time || p.patch.Clock_Out_Time) && p.patch.Total_Hours == null) after.Total_Hours = Math.round((new Date(after.Clock_Out_Time) - new Date(after.Clock_In_Time)) / 36e3) / 100;
      after.Correction_Status = p.status;
      return { before: before, after: after, reason: p.reason + (p.explanation ? ' — ' + p.explanation : ''), review: { adjustmentRequired: p.external !== 'NONE_CONFIRMED', evvReview: s.Pay_Type === 'MEDICAID_EVV' } };
    },
    api_saveShiftCorrection: function (t, sid, ver, uid, p) {
      var a = need(t, 'shift.correct_completed'), s = S(sid); var pv = H_.api_getShiftCorrectionPreview(t, sid, ver, p);
      s.Correction_Version = (s.Correction_Version || 0) + 1; s.Correction_Status = p.status; s.Correction_Requested = '';
      D.scHist.unshift({ id: uid, correctionId: uid, shiftId: sid, version: s.Correction_Version, type: p.status === 'COMPLETED' ? 'CLOSED' : 'PROPOSED', actor: a.firstName + ' ' + a.lastName, actorId: a.employeeId, at: iso(n()), reason: pv.reason, before: pv.before, after: pv.after, review: pv.review });
      return { ok: true, version: s.Correction_Version };
    },
    api_approveShiftCorrection: function (t, sid, ver, cid) {
      var a = need(t, 'shift.correct_completed'), s = S(sid), p = D.scHist.filter(function (h) { return h.correctionId === cid; })[0];
      if (!p || s.Correction_Status !== 'PENDING_REAPPROVAL') throw V('This shift changed or is no longer pending. Reopen its details.');
      if (p.actorId === a.employeeId && D.settings.Allow_Self_Approval_Shift_Corrections !== 'TRUE') throw V('A different administrator must approve this correction.');
      var x = p.after; ['Assigned_Employee_ID', 'Client_ID', 'Location_ID', 'Shift_Date', 'Start_Time', 'End_Time'].forEach(function (k) { s[k] = x[k]; });
      var e = D.te.filter(function (y) { return y.Shift_ID === sid; })[0]; if (e) { e.Clock_In_Time = x.Clock_In_Time; e.Clock_Out_Time = x.Clock_Out_Time; e.Total_Hours = x.Total_Hours; e.Employee_ID = x.Assigned_Employee_ID; e.Entry_Status = 'APPROVED'; }
      var c = careRow(sid); if (c) { c.Family_Update = x.Family_Update; c.Tasks_Done = x.Tasks_Done; c.Administrative_Note = x.Administrative_Note; }
      s.Correction_Status = 'APPROVED'; s.Attendance_Administratively_Corrected = true;
      D.scHist.unshift({ id: id('SCA'), correctionId: cid, shiftId: sid, version: s.Correction_Version, type: 'APPROVED', actor: a.firstName + ' ' + a.lastName, actorId: a.employeeId, at: iso(n()), reason: p.reason });
      audit(a, 'SHIFT_CORRECTION_APPROVED', 'Shift', sid); return { ok: true };
    },
    api_requestShiftCorrection: function (t, sid) { need(t, 'attendance.report_problem'); S(sid).Correction_Requested = true; return { ok: true }; },
    api_listSettings: function (t) { need(t, 'system.manage'); return SETTINGS.map(function (s) { return { Setting_Key: s[0], Setting_Value: D.settings[s[0]], Description: s[2] }; }); },
    api_updateSetting: function (t, k, v) { var a = need(t, 'system.manage'); var prev = D.settings[k]; D.settings[k] = String(v); audit(a, 'SETTINGS_CHANGED', 'Settings', k, '', prev, v); return { ok: true }; },
    api_listAuditLog: function (t, f) { need(t, 'audit.view'); f = f || {}; return copy(D.audit.filter(function (r) { return !f.action || r.Action === f.action; }).slice(0, 200)); }
  };

  window.DemoAPI = {
    handle: function (method, args) {
      return new Promise(function (resolve) {
        setTimeout(function () {
          try {
            if (!H_[method]) throw new Error('Unsupported portal request.');
            resolve({ ok: true, result: JSON.parse(JSON.stringify(H_[method].apply(null, args)) || 'null') });
          } catch (e) {
            resolve({ ok: false, code: e.name === 'AuthError' ? 'AUTH_REQUIRED' : 'REQUEST_FAILED', error: e.message });
          }
        }, 120 + Math.random() * 180);
      });
    }
  };
})();
