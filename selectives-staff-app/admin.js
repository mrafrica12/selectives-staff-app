/*
 * Scheduler / administrator screens. Every button is shown only when the
 * signed-in role holds the permission the server checks for that call.
 */
(function () {
  'use strict';
  var A = window.App, raw = A.raw, h = A.h, $ = A.$, $$ = A.$$, api = A.api, can = A.can, badge = A.badge, icon = A.icon, field = A.field, options = A.options;
  var fmtDate = A.fmtDate, fmtTime = A.fmtTime, fmtDT = A.fmtDT, relDay = A.relDay, todayStr = A.todayStr, addDays = A.addDays, hrs = A.hrs;

  var REF = { employees: null, locations: null, clients: null };
  async function refs(force) {
    var parts = [], keys = [];
    if (can('staff.view_directory') && (force || !REF.employees)) { parts.push(['api_listEmployees']); keys.push('employees'); }
    if (can('shift.view_all') && (force || !REF.locations)) { parts.push(['api_listLocations']); keys.push('locations'); }
    if (can('client.view_all') && (force || !REF.clients)) { parts.push(['api_listClients']); keys.push('clients'); }
    if (parts.length) {
      var token = A.S.token;
      var res = await A.batch(parts);
      if (A.S.token !== token) throw new Error('Your session changed.');
      res.forEach(function (r, i) { REF[keys[i]] = r instanceof Error ? [] : r; });
    }
    REF.employees = REF.employees || []; REF.locations = REF.locations || []; REF.clients = REF.clients || [];
    return REF;
  }
  function invalidate(k) { if (k) REF[k] = null; else REF.employees = REF.locations = REF.clients = null; }
  A.resetManagement = invalidate;
  function isActive(e) { return String(e.Employment_Status).trim().toUpperCase() === 'ACTIVE'; }
  function empName(id) { var e = (REF.employees || []).filter(function (x) { return x.Employee_ID === id; })[0]; return e ? e.First_Name + ' ' + e.Last_Name : id; }
  function caregiverOptions(selected, blank) {
    return options((REF.employees || []).filter(function (e) { return e.Role === 'CAREGIVER' && isActive(e); })
      .sort(function (a, b) { return (a.First_Name + a.Last_Name).localeCompare(b.First_Name + b.Last_Name); })
      .map(function (e) { return { value: e.Employee_ID, label: e.First_Name + ' ' + e.Last_Name }; }), selected, blank);
  }
  function employeeOptions(selected, blank) {
    return options((REF.employees || []).map(function (e) { return { value: e.Employee_ID, label: e.First_Name + ' ' + e.Last_Name + (isActive(e) ? '' : ' (inactive)') }; }), selected, blank);
  }
  function locationOptions(selected, blank, activeOnly) {
    return options((REF.locations || []).filter(function (l) { return !activeOnly || A.isTrue(l.Active_Status) || l.Location_ID === selected; })
      .map(function (l) { return { value: l.Location_ID, label: l.Location_Label + ' · ' + (l.General_Service_Area || '') }; }), selected, blank);
  }
  function clientOptions(selected, blank) {
    return options((REF.clients || []).filter(function (c) { return A.isTrue(c.Active_Status) || c.Client_ID === selected; })
      .map(function (c) { return { value: c.Client_ID, label: c.Display_Name }; }), selected, blank);
  }
  function clientName(id) { var c = (REF.clients || []).filter(function (x) { return x.Client_ID === id; })[0]; return c ? c.Display_Name : id; }
  function qs(o) { return Object.keys(o).filter(function (k) { return o[k] !== '' && o[k] != null && o[k] !== false; }).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(o[k]); }).join('&'); }
  function rowsTable(cols, rows) {
    return h`<div class="table-wrap"><table><thead><tr>${cols.map(function (c) { return h`<th>${c}</th>`; })}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  /* ========================================================= dashboard */
  A.route('dashboard', { title: 'Today', tab: 'home', wide: true, view: async function (el, r, live) {
    A.setTitle('Today');
    var t = todayStr();
    var res = await A.batch([['api_getManagementSummary'], ['api_listShiftsForManagement', { dateFrom: t, dateTo: t }]]);
    if (!live()) return;
    var s = A.ok(res[0]), today = res[1] instanceof Error ? [] : res[1];
    function tile(n, label, href, alert) { if (n === undefined) return ''; return h`<a class="stat ${alert && n ? 'alert' : ''}" href="#/${href}"><b>${n}</b><span>${label}</span></a>`; }
    el.innerHTML = h`<div class="page-head"><div><h1>Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${A.S.me.firstName}</h1><p>${fmtDate(t, { weekday: 'long', month: 'long', day: 'numeric' })}</p></div>
        ${can('shift.create') ? h`<button class="btn primary" id="new-shift">+ New shift</button>` : ''}</div>
      <div class="grid">
        ${tile(s.scheduledToday, 'caregivers scheduled today', 'shifts?' + qs({ from: t, to: t }))}
        ${tile(s.currentlyClockedIn, 'clocked in now', 'time?' + qs({ status: 'OPEN' }))}
        ${tile(s.lateClockIns, 'late clock-ins', 'time?' + qs({ status: 'OPEN' }), true)}
        ${tile(s.missingClockOuts, 'missing clock-outs', 'time?' + qs({ status: 'OPEN' }), true)}
        ${tile(s.unassignedShifts, 'unassigned upcoming shifts', 'shifts?' + qs({ unassigned: 1, to: addDays(t, 60) }), true)}
        ${tile(s.pendingRequests, 'shift requests to review', 'requests', true)}
        ${tile(s.pendingLocationOverrides, 'location checks to review', 'locationchecks', true)}
        ${tile(s.pendingFamilyUpdates, 'family updates to approve', 'familyupdates', true)}
        ${tile(s.pendingTimesheetApprovals, 'time entries to approve', 'time?' + qs({ status: 'SUBMITTED' }), true)}
        ${tile(s.qualificationsExpiringSoon, 'credentials expiring in 30 days', 'staff', true)}
      </div>
      <div class="section-title">Today’s shifts (${today.length})</div>
      ${today.length ? h`<div class="list">${today.map(function (x) { return A.shiftItem(x, { who: true }); })}</div>` : h`<div class="card empty">No shifts today.</div>`}`.s;
    A.wireGo(el);
    var ns = $('#new-shift', el); if (ns) ns.onclick = function () { newShift(); };
  } });

  /* ========================================================= shifts */
  async function shiftForm(s) {
    await refs();
    s = s || {};
    var payTypes = [{ value: 'PRIVATE_PAY', label: 'Private pay' }, { value: 'MEDICAID_EVV', label: 'Medicaid (EVV)' }, { value: 'OTHER', label: 'Other' }];
    return A.modal({
      title: s.Shift_ID ? 'Edit shift' : 'New shift', submit: s.Shift_ID ? 'Save changes' : 'Create shift',
      body: h`${field('Date', h`<input type="date" name="Shift_Date" required min="${todayStr()}" value="${s.Shift_Date || addDays(todayStr(), 1)}">`)}
        <div class="row"><label class="f" style="flex:1"><span>Start</span><input type="time" name="Start_Time" required value="${s.Start_Time || '09:00'}"></label>
        <label class="f" style="flex:1"><span>End</span><input type="time" name="End_Time" required value="${s.End_Time || '13:00'}"></label></div>
        ${field('Service location', h`<select name="Location_ID" required>${locationOptions(s.Location_ID, 'Choose…', true)}</select>`, REF.locations.length ? '' : 'Add a service location first (More → Service locations).')}
        ${can('client.view_all') ? field('Client (optional)', h`<select name="Client_ID">${clientOptions(s.Client_ID, 'No client linked')}</select>`, 'Linking a client lets their family see this visit.') : ''}
        ${field('Pay type', h`<select name="Pay_Type">${options(payTypes, s.Pay_Type || 'PRIVATE_PAY')}</select>`)}
        ${field('Required qualifications', h`<input type="text" name="Required_Qualifications" placeholder="e.g. CPR, CNA" value="${s.Required_Qualifications || ''}">`, 'Comma-separated. Only caregivers holding these (verified) see it as open.')}
        ${field('Clock-in radius', h`<select name="Geofence_Radius_Miles">${options([{ value: '', label: 'Default' }, { value: '0.25', label: '0.25 mile' }, { value: '0.5', label: '0.5 mile' }], s.Geofence_Radius_Miles === '' || s.Geofence_Radius_Miles == null ? '' : String(s.Geofence_Radius_Miles))}</select>`)}
        ${field('Internal instructions', h`<textarea name="Internal_Instructions" maxlength="1000">${s.Internal_Instructions || ''}</textarea>`, 'Office-only; not shown to caregivers.')}`,
      onSubmit: async function (v) {
        if (!v.Location_ID) throw new Error('Choose a service location.');
        if (!s.Shift_ID) return api('api_createShift', v);
        var patch = {};
        Object.keys(v).forEach(function (k) { if (String(v[k]) !== String(s[k] == null ? '' : s[k])) patch[k] = v[k]; });
        if (!Object.keys(patch).length) return true;
        return api('api_editShift', s.Shift_ID, patch);
      }
    });
  }
  async function newShift() {
    var rec = await shiftForm();
    if (rec && rec.Shift_ID) { A.toast('Shift created as a draft. Assign it or publish it as open.'); A.go('shift/' + rec.Shift_ID); }
  }
  /** Assignment with the server's "warnings need an override reason" handshake. */
  async function assignFlow(shift) {
    await refs();
    var picked = await A.modal({
      title: shift.Assigned_Employee_ID ? 'Reassign shift' : 'Assign caregiver', submit: 'Assign',
      body: h`<p class="muted small">${fmtDate(shift.Shift_Date)} · ${fmtTime(shift.Start_Time)}–${fmtTime(shift.End_Time)}</p>${field('Caregiver', h`<select name="emp" required>${caregiverOptions(shift.Assigned_Employee_ID, 'Choose…')}</select>`)}`,
      onSubmit: function (v) { if (!v.emp) throw new Error('Choose a caregiver.'); return v.emp; }
    });
    if (!picked) return;
    var r = await api('api_assignShift', shift.Shift_ID, picked, '');
    if (r.ok === false && r.warnings) {
      var reason = await A.modal({
        title: 'Check before assigning', submit: 'Assign anyway',
        body: h`${r.warnings.map(function (w) { return h`<div class="notice warn">${w}</div>`; })}${field('Reason for overriding', h`<textarea name="reason" required maxlength="300"></textarea>`, 'Saved in the audit log.')}`,
        onSubmit: function (v) { if (!v.reason) throw new Error('A reason is required to override.'); return v.reason; }
      });
      if (!reason) return;
      r = await api('api_assignShift', shift.Shift_ID, picked, reason);
    }
    if (r.ok) { A.toast('Assigned to ' + empName(picked) + '. They have been notified.'); A.render(); }
  }
  async function approveRequestFlow(req) {
    var r = await api('api_approveShiftRequest', req.Request_ID, '');
    if (r.ok === false && r.warnings) {
      var note = await A.modal({
        title: 'Check before approving', submit: 'Approve anyway',
        body: h`${r.warnings.map(function (w) { return h`<div class="notice warn">${w}</div>`; })}${field('Reason / note', h`<textarea name="note" required maxlength="300"></textarea>`)}`,
        onSubmit: function (v) { if (!v.note) throw new Error('A note is required to override.'); return v.note; }
      });
      if (!note) return false;
      r = await api('api_approveShiftRequest', req.Request_ID, note);
    }
    if (r.ok) A.toast('Approved. Other requests for this shift were declined automatically.');
    return r.ok;
  }

  A.route('shifts', { title: 'Shifts', wide: true, view: async function (el, r, live) {
    A.setTitle('Shifts');
    var q = r.query, t = todayStr();
    var f = { dateFrom: q.from || t, dateTo: q.to || addDays(t, 14), status: q.status || '', employeeId: q.emp || '', unassigned: q.unassigned === '1' };
    await refs();
    var filters = { dateFrom: f.dateFrom, dateTo: f.dateTo };
    if (f.status) filters.status = f.status; if (f.employeeId) filters.employeeId = f.employeeId; if (f.unassigned) filters.unassigned = true;
    var list = await api('api_listShiftsForManagement', filters);
    if (!live()) return;
    var statuses = ['DRAFT', 'OPEN', 'REQUESTED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
    el.innerHTML = h`<div class="page-head"><h1>Shifts</h1>${can('shift.create') ? h`<button class="btn primary" id="new">+ New shift</button>` : ''}</div>
      <form class="filters card" id="flt">
        ${field('From', h`<input type="date" name="from" value="${f.dateFrom}">`)}${field('To', h`<input type="date" name="to" value="${f.dateTo}">`)}
        ${field('Status', h`<select name="status">${options(statuses, f.status, 'Any')}</select>`)}
        ${can('staff.view_directory') ? field('Caregiver', h`<select name="emp">${caregiverOptions(f.employeeId, 'Anyone')}</select>`) : ''}
        <label class="check"><input type="checkbox" name="unassigned" ${f.unassigned ? 'checked' : ''}> Unassigned only</label>
      </form>
      <p class="small muted">${list.length} shift${list.length === 1 ? '' : 's'}</p>
      ${list.length ? h`<div class="list">${list.map(function (s) { return A.shiftItem(s, { who: true }); })}</div>` : h`<div class="card empty">No shifts match.</div>`}`.s;
    var flt = $('#flt', el);
    flt.onchange = function () { var v = A.formValues(flt); A.go('shifts?' + qs({ from: v.from, to: v.to, status: v.status, emp: v.emp, unassigned: v.unassigned ? 1 : '' })); };
    A.wireGo(el);
    var nb = $('#new', el); if (nb) nb.onclick = newShift;
  } });

  A.route('mshift', { title: 'Shift', tab: 'shifts', wide: true, view: async function (el, r, live) {
    A.setTitle('Shift');
    await refs();
    var cached = A.S.shiftCache[r.id];
    var list = await api('api_listShiftsForManagement', cached ? { dateFrom: cached.Shift_Date, dateTo: cached.Shift_Date } : {});
    var s = list.filter(function (x) { return x.Shift_ID === r.id; })[0];
    if (!s && cached) { list = await api('api_listShiftsForManagement', {}); s = list.filter(function (x) { return x.Shift_ID === r.id; })[0]; }
    if (!live()) return;
    if (!s) { el.innerHTML = h`<div class="card empty">Shift not found.</div>`.s; return; }
    A.S.shiftCache[s.Shift_ID] = s;
    var editable = ['DRAFT', 'OPEN', 'REQUESTED', 'ASSIGNED'].indexOf(s.Shift_Status) !== -1 && (s.Shift_Date > todayStr() || (s.Shift_Date === todayStr()));
    var requests = [], care = null;
    if (can('shift.approve_request') && ['OPEN', 'REQUESTED', 'ASSIGNED'].indexOf(s.Shift_Status) !== -1) { try { requests = await api('api_listShiftRequests', s.Shift_ID); } catch (e) {} }
    if (s.Client_ID && can('visit.view_all') && ['IN_PROGRESS', 'COMPLETED'].indexOf(s.Shift_Status) !== -1) { try { care = await api('api_getVisitCare', s.Shift_ID); } catch (e) {} }
    if (!live()) return;
    var pending = requests.filter(function (q) { return q.Request_Status === 'PENDING'; });
    el.innerHTML = h`<div class="card">
        <div class="row between"><h2>${relDay(s.Shift_Date)} · ${fmtTime(s.Start_Time)} – ${fmtTime(s.End_Time)}</h2>${badge(s.Shift_Status)}</div>
        <dl class="kv" style="margin-top:10px">
          <dt>Caregiver</dt><dd>${s.Assigned_Employee_Name || 'Unassigned'}</dd>
          <dt>Location</dt><dd>${s.Location_Label || s.Location_ID}${s.Street_Address ? h` · <a href="${A.mapsLink(s.Street_Address)}" target="_blank" rel="noopener">${s.Street_Address}</a>` : ''}</dd>
          ${s.Client_ID ? h`<dt>Client</dt><dd>${clientName(s.Client_ID)}</dd>` : ''}
          <dt>Pay type</dt><dd>${A.payLabel(s.Pay_Type)}</dd>
          ${s.Required_Qualifications ? h`<dt>Requires</dt><dd>${s.Required_Qualifications}</dd>` : ''}
          <dt>Clock-in radius</dt><dd>${s.Geofence_Radius_Miles ? s.Geofence_Radius_Miles + ' mi' : 'Default'}</dd>
          ${s.Internal_Instructions ? h`<dt>Instructions</dt><dd>${s.Internal_Instructions}</dd>` : ''}
          ${s.Correction_Status ? h`<dt>Correction</dt><dd>${badge(s.Correction_Status)}</dd>` : ''}
          <dt>Shift ID</dt><dd class="mono">${s.Shift_ID}</dd>
        </dl>
        <div class="actions">
          ${editable && can('shift.assign') ? h`<button class="btn primary" id="assign">${s.Assigned_Employee_ID ? 'Reassign' : 'Assign caregiver'}</button>` : ''}
          ${editable && can('shift.create') && s.Shift_Status === 'DRAFT' ? h`<button class="btn" id="publish">Publish as open shift</button>` : ''}
          ${editable && can('shift.edit') ? h`<button class="btn" id="edit">Edit</button>` : ''}
          ${['CANCELLED', 'COMPLETED'].indexOf(s.Shift_Status) === -1 && can('shift.edit') ? h`<button class="btn danger" id="cancel">Cancel shift</button>` : ''}
          ${s.Shift_Status === 'COMPLETED' && can('shift.correct_completed') ? h`<a class="btn" href="#/correction/${s.Shift_ID}">Completed shift details & corrections</a>` : ''}
        </div></div>
      ${requests.length ? h`<div class="section-title">Requests (${pending.length} pending)</div><div class="list">${requests.map(function (q) {
        return h`<div class="item"><div class="body"><b>${q.Employee_Name}</b><span>Requested ${fmtDT(q.Requested_At)}${q.Management_Note ? ' · ' + q.Management_Note : ''}</span></div>
          ${q.Request_Status === 'PENDING' ? h`<button class="btn sm primary" data-ap="${q.Request_ID}">Approve</button><button class="btn sm danger" data-rj="${q.Request_ID}">Decline</button>` : badge(q.Request_Status)}</div>`;
      })}</div>` : ''}
      ${care ? h`<div class="section-title">Visit care</div><div class="card"><p>${badge(care.approvalStatus || 'PENDING', care.approvalStatus || 'Nothing submitted')}</p><p>${(care.tasks || []).join(', ') || 'No tasks recorded.'}</p>${care.staffNote ? h`<p class="muted">Caregiver note: ${care.staffNote}</p>` : ''}${care.familyUpdate ? h`<div class="notice ok">Family sees: ${care.familyUpdate}</div>` : ''}${care.approvalStatus === 'PENDING' && can('visit.approve_family_update') ? h`<a class="btn sm" href="#/familyupdates">Review family update</a>` : ''}</div>` : ''}`.s;
    var b;
    if ((b = $('#assign', el))) b.onclick = function () { A.act(b, 'Checking…', function () { return assignFlow(s); }); };
    if ((b = $('#publish', el))) b.onclick = function () { var x = this; A.act(x, 'Publishing…', async function () { await api('api_publishShiftOpen', s.Shift_ID); A.toast('Published. Eligible caregivers were notified.'); A.render(); }); };
    if ((b = $('#edit', el))) b.onclick = async function () { if (await shiftForm(s)) { A.toast('Shift updated.'); A.render(); } };
    if ((b = $('#cancel', el))) b.onclick = async function () {
      var reason = await A.askText('Cancel this shift?', 'Reason (the caregiver will see it)', { submit: 'Cancel shift', danger: true });
      if (reason == null) return;
      try { await api('api_cancelShift', s.Shift_ID, reason); A.toast('Shift cancelled.'); A.render(); } catch (e) { A.toast(e.message, true); }
    };
    $$('[data-ap]', el).forEach(function (x) { x.onclick = function () { A.act(x, 'Approving…', async function () { var req = requests.filter(function (q) { return q.Request_ID === x.dataset.ap; })[0]; if (await approveRequestFlow(req)) A.render(); }); }; });
    $$('[data-rj]', el).forEach(function (x) { x.onclick = async function () { var note = await A.askText('Decline request', 'Note to the caregiver (optional)', { required: false, submit: 'Decline', danger: true }); if (note == null) return; try { await api('api_rejectShiftRequest', x.dataset.rj, note); A.toast('Declined.'); A.render(); } catch (e) { A.toast(e.message, true); } }; });
  } });

  A.route('requests', { title: 'Shift requests', tab: 'more', perm: 'shift.approve_request', wide: true, view: async function (el, r, live) {
    A.setTitle('Shift requests');
    var t = todayStr();
    var res = await A.batch([['api_listShiftRequests'], ['api_listShiftsForManagement', { dateFrom: addDays(t, -1) }]]);
    if (!live()) return;
    var reqs = A.ok(res[0]), shifts = {};
    (res[1] instanceof Error ? [] : res[1]).forEach(function (s) { shifts[s.Shift_ID] = s; A.S.shiftCache[s.Shift_ID] = s; });
    var pending = reqs.filter(function (q) { return q.Request_Status === 'PENDING' && shifts[q.Shift_ID]; })
      .sort(function (a, b) { var x = shifts[a.Shift_ID], y = shifts[b.Shift_ID]; return (x.Shift_Date + x.Start_Time).localeCompare(y.Shift_Date + y.Start_Time); });
    el.innerHTML = h`<div class="page-head"><h1>Shift requests</h1><p>${pending.length} waiting</p></div>
      ${pending.length ? pending.map(function (q) {
        var s = shifts[q.Shift_ID];
        return h`<div class="card"><div class="row between"><div class="row">${A.dateTile(s.Shift_Date)}<div><b>${q.Employee_Name}</b><div class="small muted">${fmtTime(s.Start_Time)}–${fmtTime(s.End_Time)} · ${s.Location_Label || s.General_Service_Area}</div></div></div><a class="btn sm ghost" href="#/shift/${s.Shift_ID}">Shift</a></div>
          <div class="actions"><button class="btn primary" data-ap="${q.Request_ID}">Approve</button><button class="btn danger" data-rj="${q.Request_ID}">Decline</button></div></div>`;
      }) : h`<div class="card empty">No pending requests.</div>`}`.s;
    $$('[data-ap]', el).forEach(function (x) { x.onclick = function () { A.act(x, 'Approving…', async function () { if (await approveRequestFlow(reqs.filter(function (q) { return q.Request_ID === x.dataset.ap; })[0])) A.render(); }); }; });
    $$('[data-rj]', el).forEach(function (x) { x.onclick = async function () { var note = await A.askText('Decline request', 'Note to the caregiver (optional)', { required: false, submit: 'Decline', danger: true }); if (note == null) return; try { await api('api_rejectShiftRequest', x.dataset.rj, note); A.toast('Declined.'); A.render(); } catch (e) { A.toast(e.message, true); } }; });
  } });

  /* ========================================================= time */
  function timeTabs(active) {
    var tabs = [['time', 'Time entries', 'attendance.view_all'], ['locationchecks', 'Location checks', 'location.view_status'], ['corrections', 'Correction requests', 'timesheet.review'], ['payroll', 'Payroll', 'timesheet.export']]
      .filter(function (t) { return can(t[2]); });
    return h`<div class="seg">${tabs.map(function (t) { return h`<button type="button" data-tab="${t[0]}" class="${t[0] === active ? 'on' : ''}">${t[1]}</button>`; })}</div>`;
  }
  function wireTimeTabs(el) { $$('[data-tab]', el).forEach(function (b) { b.onclick = function () { A.go(b.dataset.tab); }; }); }

  async function entryModal(e) {
    var actions = [];
    var canApprove = can('timesheet.approve') && ['SUBMITTED', 'EXCEPTION', 'CORRECTED'].indexOf(e.Entry_Status) !== -1 && e.Clock_Out_Time;
    var canReject = can('timesheet.approve') && e.Clock_Out_Time && e.Entry_Status !== 'REJECTED';
    var canCorrect = can('time.correct') && !e.Completed_Shift;
    var choice = await A.modal({
      title: e.Employee_Name + ' · ' + fmtDate(e.Shift_Date), submit: false, cancel: 'Close',
      body: h`<dl class="kv"><dt>Scheduled</dt><dd>${fmtTime(e.Start_Time)} – ${fmtTime(e.End_Time)}</dd>
          <dt>Clock in</dt><dd>${fmtDT(e.Clock_In_Time) || '—'} ${badge(e.Clock_In_Geofence_Status)}${e.Clock_In_Distance_Meters !== '' && e.Clock_In_Distance_Meters != null ? h` <span class="small muted">${Math.round(e.Clock_In_Distance_Meters)} m away</span>` : ''}</dd>
          <dt>Clock out</dt><dd>${fmtDT(e.Clock_Out_Time) || '—'} ${badge(e.Clock_Out_Geofence_Status)}${e.Clock_Out_Distance_Meters !== '' && e.Clock_Out_Distance_Meters != null ? h` <span class="small muted">${Math.round(e.Clock_Out_Distance_Meters)} m away</span>` : ''}</dd>
          <dt>Hours</dt><dd>${hrs(e.Total_Hours) || '—'}</dd><dt>Status</dt><dd>${badge(e.Entry_Status)}</dd>
          ${e.Correction_Reason ? h`<dt>Correction</dt><dd>${e.Correction_Reason} ${e.Corrected_By ? '(' + e.Corrected_By + ')' : ''}</dd>` : ''}
          ${e.Approved_By ? h`<dt>Approved</dt><dd>${e.Approved_By} · ${fmtDT(e.Approved_At)}</dd>` : ''}</dl>
        ${e.Correction_Pending ? h`<div class="notice warn">A completed-shift correction is pending for this shift.</div>` : ''}
        <div class="actions">
          ${canApprove ? h`<button type="button" class="btn primary" data-c="approve">Approve</button>` : ''}
          ${canCorrect ? h`<button type="button" class="btn" data-c="correct">Correct times</button>` : ''}
          ${e.Completed_Shift && can('shift.correct_completed') ? h`<button type="button" class="btn" data-c="completed">Completed shift details</button>` : ''}
          ${canReject ? h`<button type="button" class="btn danger" data-c="reject">Reject</button>` : ''}
        </div>`,
      onOpen: function (form, close) { $$('[data-c]', form).forEach(function (b) { b.onclick = function () { close(b.dataset.c); }; }); }
    });
    if (choice === 'approve') { await api('api_approveTimeEntry', e.Time_Entry_ID); A.toast('Approved.'); A.render(); }
    if (choice === 'completed') A.go('correction/' + e.Shift_ID);
    if (choice === 'reject') { var why = await A.askText('Reject time entry', 'Reason (sent to the caregiver)', { submit: 'Reject', danger: true }); if (why != null) { await api('api_rejectTimeEntry', e.Time_Entry_ID, why); A.toast('Rejected.'); A.render(); } }
    if (choice === 'correct') {
      var done = await A.modal({
        title: 'Correct time entry', submit: 'Save correction',
        body: h`${field('Clock in', h`<input type="datetime-local" name="in" value="${A.isoToWall(e.Clock_In_Time)}" required>`)}${field('Clock out', h`<input type="datetime-local" name="out" value="${A.isoToWall(e.Clock_Out_Time)}" required>`)}${field('Reason', h`<textarea name="reason" required maxlength="300"></textarea>`, 'Required. The old values are kept in the audit log.')}`,
        onSubmit: function (v) {
          if (!v.in || !v.out || !v.reason) throw new Error('Clock in, clock out and a reason are required.');
          return api('api_correctTimeEntry', e.Time_Entry_ID, { Clock_In_Time: A.wallToIso(v.in), Clock_Out_Time: A.wallToIso(v.out) }, v.reason);
        }
      });
      if (done) { A.toast('Time entry corrected.'); A.render(); }
    }
  }

  A.route('time', { title: 'Time', wide: true, perm: 'attendance.view_all', view: async function (el, r, live) {
    A.setTitle('Time');
    var q = r.query, t = todayStr();
    await refs();
    var f = { dateFrom: q.from || addDays(t, -14), dateTo: q.to || t };
    if (q.status) f.status = q.status; if (q.emp) f.employeeId = q.emp;
    var list = await api('api_listTimeEntries', f);
    if (!live()) return;
    list.sort(function (a, b) { return String(b.Shift_Date || '').localeCompare(String(a.Shift_Date || '')); });
    var statuses = ['OPEN', 'SUBMITTED', 'EXCEPTION', 'CORRECTED', 'APPROVED', 'REJECTED'];
    el.innerHTML = h`${timeTabs('time')}
      <div class="page-head"><h1>Time entries</h1>${can('timesheet.approve') ? h`<button class="btn primary" id="bulk">Approve a timesheet</button>` : ''}</div>
      <form class="filters card" id="flt">${field('From', h`<input type="date" name="from" value="${f.dateFrom}">`)}${field('To', h`<input type="date" name="to" value="${f.dateTo}">`)}
        ${field('Status', h`<select name="status">${options(statuses, q.status || '', 'Any')}</select>`)}${field('Caregiver', h`<select name="emp">${employeeOptions(q.emp || '', 'Anyone')}</select>`)}</form>
      ${list.length ? h`<div class="list">${list.map(function (e, i) {
        return h`<div class="item tap" data-i="${i}">${e.Shift_Date ? A.dateTile(e.Shift_Date) : ''}<div class="body"><b>${e.Employee_Name}</b><span>${fmtDT(e.Clock_In_Time, false) || '—'} → ${e.Clock_Out_Time ? fmtDT(e.Clock_Out_Time, false) : 'still clocked in'} · ${hrs(e.Total_Hours)}</span></div>
          <div style="text-align:right">${badge(e.Entry_Status)}<br>${e.Clock_In_Geofence_Status && e.Clock_In_Geofence_Status !== 'INSIDE' ? badge(e.Clock_In_Geofence_Status) : ''}</div></div>`;
      })}</div>` : h`<div class="card empty">No time entries match.</div>`}`.s;
    wireTimeTabs(el);
    var flt = $('#flt', el); flt.onchange = function () { var v = A.formValues(flt); A.go('time?' + qs(v)); };
    $$('[data-i]', el).forEach(function (it) { it.onclick = function () { entryModal(list[Number(it.dataset.i)]).catch(function (e) { A.toast(e.message, true); }); }; });
    var bulk = $('#bulk', el);
    if (bulk) bulk.onclick = async function () {
      var res = await A.modal({
        title: 'Approve a timesheet', submit: 'Approve all eligible',
        body: h`<p class="small muted">Approves every submitted, flagged or corrected entry with a clock-out for one person in the period.</p>${field('Caregiver', h`<select name="emp" required>${employeeOptions(q.emp || '', 'Choose…')}</select>`)}
          <div class="row"><label class="f" style="flex:1"><span>From</span><input type="date" name="from" value="${f.dateFrom}"></label><label class="f" style="flex:1"><span>To</span><input type="date" name="to" value="${f.dateTo}"></label></div>`,
        onSubmit: function (v) { if (!v.emp) throw new Error('Choose a caregiver.'); return api('api_approveTimesheet', v.emp, v.from, v.to); }
      });
      if (res) { A.toast(res.approvedCount + ' entr' + (res.approvedCount === 1 ? 'y' : 'ies') + ' approved.'); A.render(); }
    };
  } });

  var OVERRIDE_REASONS = [
    { value: 'GPS_ACCURACY', label: 'GPS accuracy issue' }, { value: 'MET_OUTSIDE', label: 'Client met caregiver outside residence' },
    { value: 'LARGE_PROPERTY', label: 'Large property' }, { value: 'PARKING', label: 'Parking restrictions' },
    { value: 'EMERGENCY', label: 'Emergency situation' }, { value: 'SUPERVISOR_VERIFIED', label: 'Supervisor verified presence' }, { value: 'OTHER', label: 'Other' }
  ];
  A.route('locationchecks', { title: 'Location checks', tab: 'time', wide: true, perm: 'location.view_status', view: async function (el, r, live) {
    A.setTitle('Location checks');
    var mode = r.query.show || 'review';
    var filt = mode === 'requested' ? { requestedOnly: true } : mode === 'all' ? {} : {};
    var list = await api('api_listClockEvents', filt);
    if (!live()) return;
    if (mode === 'review') list = list.filter(function (x) { return x.Needs_Review; });
    el.innerHTML = h`${timeTabs('locationchecks')}
      <div class="seg"><button data-m="review" class="${mode === 'review' ? 'on' : ''}">Needs review</button><button data-m="requested" class="${mode === 'requested' ? 'on' : ''}">Caregiver asked</button><button data-m="all" class="${mode === 'all' ? 'on' : ''}">All attempts</button></div>
      ${list.length ? list.map(function (x) {
        return h`<div class="card"><div class="row between"><b>${x.Employee_Name}</b>${badge(x.Category)}</div>
          <p class="small muted">${x.Event_Type === 'CLOCK_IN' ? 'Clock-in' : 'Clock-out'} · ${fmtDT(x.Server_Timestamp)} · shift ${fmtDate(x.Shift_Date)} ${fmtTime(x.Start_Time)}–${fmtTime(x.End_Time)}</p>
          <p class="small">${x.Distance_Miles !== '' && x.Distance_Miles != null ? Number(x.Distance_Miles).toFixed(2) + ' mi away (allowed ' + x.Allowed_Radius_Miles + ' mi)' : 'No usable reading'}${x.GPS_Accuracy_Meters !== '' && x.GPS_Accuracy_Meters != null ? ' · accuracy ' + Math.round(x.GPS_Accuracy_Meters) + ' m' : ''}</p>
          ${x.Detail ? h`<p class="small muted">${x.Detail}</p>` : ''}
          ${x.Override_Requested ? h`<div class="notice warn">Caregiver: “${x.Override_Request_Reason}”</div>` : ''}
          ${x.Override_Decision ? h`<p class="small">${badge(x.Override_Decision)} ${x.Override_Reason} — ${x.Override_By} ${fmtDT(x.Override_At)}</p>` : ''}
          ${x.Can_Override ? h`<div class="actions"><button class="btn primary sm" data-ov="${x.Event_ID}" data-d="APPROVED">Approve</button><button class="btn danger sm" data-ov="${x.Event_ID}" data-d="DENIED">Deny</button></div>`
            : (x.Needs_Review && !can('location.approve_override') ? h`<p class="small muted">An administrator decides on this attempt.</p>` : '')}</div>`;
      }) : h`<div class="card empty">${mode === 'all' ? 'No clock attempts yet.' : 'Nothing waiting for review.'}</div>`}`.s;
    wireTimeTabs(el);
    $$('[data-m]', el).forEach(function (b) { b.onclick = function () { A.go('locationchecks?show=' + b.dataset.m); }; });
    $$('[data-ov]', el).forEach(function (b) {
      b.onclick = async function () {
        var approve = b.dataset.d === 'APPROVED';
        var done = await A.modal({
          title: approve ? 'Approve this attempt' : 'Deny this attempt', submit: approve ? 'Approve' : 'Deny', danger: !approve,
          body: h`${approve ? h`<p class="small muted">For a clock-in, this starts the time entry at the original attempt time.</p>` : ''}${field('Reason', h`<select name="cat">${options(OVERRIDE_REASONS)}</select>`)}${field('Details', h`<textarea name="text" maxlength="500"></textarea>`, 'Required when the reason is Other.')}`,
          onSubmit: function (v) { if (v.cat === 'OTHER' && !v.text) throw new Error('Describe the reason.'); return api('api_overrideClockEvent', b.dataset.ov, b.dataset.d, v.cat, v.text); }
        });
        if (done) { A.toast('Decision recorded. The caregiver was notified.'); A.render(); }
      };
    });
  } });

  A.route('corrections', { title: 'Correction requests', tab: 'time', wide: true, perm: 'timesheet.review', view: async function (el, r, live) {
    A.setTitle('Correction requests');
    var list = await api('api_listCorrectionRequests');
    if (!live()) return;
    list.sort(function (a, b) { return (a.Request_Status === 'PENDING' ? 0 : 1) - (b.Request_Status === 'PENDING' ? 0 : 1) || new Date(b.Submitted_At) - new Date(a.Submitted_At); });
    el.innerHTML = h`${timeTabs('corrections')}
      ${list.length ? list.slice(0, 100).map(function (c, i) {
        return h`<div class="card"><div class="row between"><b>${c.Employee_Name}</b>${badge(c.Request_Status)}</div>
          <p>${c.Reason}</p>
          <p class="small muted">Sent ${fmtDT(c.Submitted_At)}${c.Requested_Clock_In ? ' · wants in ' + fmtDT(c.Requested_Clock_In) : ''}${c.Requested_Clock_Out ? ' · out ' + fmtDT(c.Requested_Clock_Out) : ''}</p>
          ${c.Management_Response ? h`<p class="small">Response: ${c.Management_Response}</p>` : ''}
          ${c.Request_Status === 'PENDING' && can('time.correct') ? h`<div class="actions">${c.Completed_Shift_ID ? h`<a class="btn sm" href="#/correction/${c.Completed_Shift_ID}">Open completed shift</a>` : ''}<button class="btn sm primary" data-res="${i}">Resolve</button></div>` : ''}</div>`;
      }) : h`<div class="card empty">No correction requests.</div>`}`.s;
    wireTimeTabs(el);
    $$('[data-res]', el).forEach(function (b) {
      b.onclick = async function () {
        var c = list[Number(b.dataset.res)];
        var done = await A.modal({
          title: 'Resolve request', submit: 'Save decision',
          body: h`<p>${c.Reason}</p>${c.Completed_Shift_ID ? h`<div class="notice warn">This shift is completed. To approve, first save and reapprove a correction on the completed shift, then write your response here.</div>` : ''}
            ${field('Decision', h`<select name="dec">${options([{ value: 'yes', label: 'Approve' }, { value: 'no', label: 'Decline' }])}</select>`)}
            ${!c.Completed_Shift_ID ? h`${field('Corrected clock in', h`<input type="datetime-local" name="in" value="${A.isoToWall(c.Requested_Clock_In)}">`)}${field('Corrected clock out', h`<input type="datetime-local" name="out" value="${A.isoToWall(c.Requested_Clock_Out)}">`)}` : ''}
            ${field('Response to the caregiver', h`<textarea name="resp" maxlength="500"></textarea>`)}`,
          onSubmit: function (v) {
            var approve = v.dec === 'yes', times = {};
            if (approve && !c.Completed_Shift_ID) { if (v.in) times.Clock_In_Time = A.wallToIso(v.in); if (v.out) times.Clock_Out_Time = A.wallToIso(v.out); }
            return api('api_resolveCorrectionRequest', c.Correction_Request_ID, approve, v.resp, times);
          }
        });
        if (done) { A.toast('Saved. The caregiver was notified.'); A.render(); }
      };
    });
  } });

  A.route('payroll', { title: 'Payroll export', tab: 'time', wide: true, perm: 'timesheet.export', view: async function (el) {
    A.setTitle('Payroll export');
    await refs();
    var t = todayStr();
    el.innerHTML = h`${timeTabs('payroll')}<form class="card" id="pf"><h2>Export hours to CSV</h2>
      <p class="small muted">For payroll preparation only — it doesn’t calculate wages or taxes. Shifts with a pending correction are held back.</p>
      <div class="row"><label class="f" style="flex:1"><span>Period start</span><input type="date" name="periodStart" value="${addDays(t, -7)}"></label><label class="f" style="flex:1"><span>Period end</span><input type="date" name="periodEnd" value="${addDays(t, -1)}"></label></div>
      ${field('Caregiver', h`<select name="employeeId">${employeeOptions('', 'Everyone')}</select>`)}
      <label class="check"><input type="checkbox" name="approvedOnly" checked> Approved entries only</label>
      <button class="btn primary" type="submit">${icon('download')} Download CSV</button><div id="out"></div></form>`.s;
    wireTimeTabs(el);
    var pf = $('#pf', el);
    pf.onsubmit = function (e) {
      e.preventDefault(); var v = A.formValues(pf);
      A.act($('button[type=submit]', pf), 'Exporting…', async function () {
        var f = { periodStart: v.periodStart, periodEnd: v.periodEnd, approvedOnly: v.approvedOnly };
        if (v.employeeId) f.employeeId = v.employeeId;
        var res = await api('api_exportPayrollCsv', f);
        var url = URL.createObjectURL(new Blob([res.csv], { type: 'text/csv' }));
        var a = document.createElement('a'); a.href = url; a.download = res.filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
        $('#out', pf).innerHTML = h`<div class="notice ok">${res.rowCount} row${res.rowCount === 1 ? '' : 's'} exported${res.heldCount ? h` · <b>${res.heldCount} held</b> for pending corrections` : ''}.</div>`.s;
      });
    };
  } });

  /* ========================================================= completed shift corrections */
  var FIELD_LABELS = { Assigned_Employee_ID: 'Caregiver', Client_ID: 'Client', Location_ID: 'Location', Shift_Date: 'Service date', Start_Time: 'Scheduled start', End_Time: 'Scheduled end', Clock_In_Time: 'Clock in', Clock_Out_Time: 'Clock out', Total_Hours: 'Worked hours', Administrative_Note: 'Admin note', Family_Update: 'Family update', Tasks_Done: 'Care tasks', Correction_Status: 'Status', Entry_Status: 'Time entry', Approval_Status: 'Visit approval' };
  function showVal(k, v, d) {
    if (v === '' || v == null) return '—';
    if (k === 'Assigned_Employee_ID' || k === 'Employee_ID') { var c = (d.references.caregivers || []).filter(function (x) { return x.id === v; })[0]; return c ? c.label : v; }
    if (k === 'Client_ID') { var cl = (d.references.clients || []).filter(function (x) { return x.id === v; })[0]; return cl ? cl.label : v; }
    if (k === 'Location_ID') { var l = (d.references.locations || []).filter(function (x) { return x.id === v; })[0]; return l ? l.label : v; }
    if (/_Time$/.test(k) && /T/.test(String(v))) return fmtDT(v);
    if (k === 'Start_Time' || k === 'End_Time') return fmtTime(v);
    if (k === 'Shift_Date') return fmtDate(v, { year: 'numeric' });
    if (k === 'Total_Hours') return hrs(v);
    return String(v).replace(/,/g, ', ');
  }
  A.route('correction', { title: 'Completed shift', tab: 'shifts', wide: true, perm: 'shift.correct_completed', view: async function (el, r, live) {
    A.setTitle('Completed shift');
    var d = await api('api_getCompletedShift', r.id);
    var hist = [];
    try { hist = await api('api_listShiftCorrectionHistory', r.id, { limit: 25 }); } catch (e) {}
    if (!live()) return;
    var cur = d.current, p = d.pending;
    var keys = ['Assigned_Employee_ID', 'Client_ID', 'Location_ID', 'Shift_Date', 'Start_Time', 'End_Time', 'Clock_In_Time', 'Clock_Out_Time', 'Total_Hours', 'Entry_Status', 'Tasks_Done', 'Staff_Note', 'Family_Update', 'Administrative_Note', 'Approval_Status'];
    var diff = p ? Object.keys(FIELD_LABELS).filter(function (k) { return String(p.before[k] == null ? '' : p.before[k]) !== String(p.after[k] == null ? '' : p.after[k]); }) : [];
    var canApprove = p && cur.Correction_Status === 'PENDING_REAPPROVAL' && (p.actorId !== d.actorId || d.canSelfApprove);
    el.innerHTML = h`<div class="page-head"><div><h1>Completed shift</h1><p class="mono">${r.id}</p></div><div class="row">${badge(cur.Correction_Status)}${d.requested ? badge('PENDING', 'Caregiver requested a correction') : ''}${d.adjustmentRequired ? badge('EXCEPTION', 'Payroll adjustment required') : ''}</div></div>
      ${d.blocked ? h`<div class="notice bad">This shift has duplicate time or visit records. Fix the sheet before correcting it.</div>` : ''}
      ${d.payrollExportedAt || d.priorPayrollExportPossible ? h`<div class="notice warn">${d.payrollExportedAt ? 'Exported to payroll ' + fmtDT(d.payrollExportedAt) + '.' : 'This shift may have been included in an earlier payroll export.'} Changes to hours will be flagged for a payroll adjustment.</div>` : ''}
      <div class="card"><dl class="kv">${keys.map(function (k) { return h`<dt>${FIELD_LABELS[k] || k.replace(/_/g, ' ')}</dt><dd>${/Status$/.test(k) && cur[k] ? badge(cur[k]) : showVal(k, cur[k], d)}</dd>`; })}</dl>
        <div class="actions">${!d.blocked && !p ? h`<button class="btn primary" id="propose">Propose a correction</button>` : ''}
        ${!d.blocked && !p && (cur.Correction_Status !== 'COMPLETED' || d.requested) ? h`<button class="btn" id="close">Close with no change</button>` : ''}</div></div>
      ${p ? h`<div class="section-title">Pending correction</div><div class="card"><p><b>${p.actor}</b> · ${fmtDT(p.at)}</p><p>${p.reason}</p>
        ${rowsTable(['Field', 'Before', 'After'], diff.map(function (k) { return h`<tr><td>${FIELD_LABELS[k]}</td><td>${showVal(k, p.before[k], d)}</td><td><b>${showVal(k, p.after[k], d)}</b></td></tr>`; }))}
        ${p.review && p.review.evvReview ? h`<div class="notice warn">Medicaid EVV visit — update the EVV system too.</div>` : ''}
        ${canApprove ? h`<button class="btn primary" id="approve">Approve & apply</button>` : h`<p class="small muted">${cur.Correction_Status === 'CORRECTION_REQUIRED' ? 'Marked as needing correction. Propose a new version to continue.' : 'A different administrator must approve this correction.'}</p>`}
        ${cur.Correction_Status === 'CORRECTION_REQUIRED' ? h`<button class="btn" id="propose">Propose a new version</button>` : ''}</div>` : ''}
      <div class="section-title">History</div>
      ${hist.length ? h`<div class="list">${hist.map(function (ev) { return h`<div class="item"><div class="body"><b>${ev.type} · v${ev.version}</b><span>${ev.actor} · ${fmtDT(ev.at)}</span><span style="white-space:normal">${ev.reason}</span></div></div>`; })}</div>` : h`<div class="card empty">No correction history.</div>`}`.s;
    var b;
    if ((b = $('#approve', el))) b.onclick = function () { var x = this; A.act(x, 'Applying…', async function () { await api('api_approveShiftCorrection', r.id, d.version, p.correctionId); A.toast('Correction applied.'); A.render(); }); };
    $$('#propose', el).forEach(function (x) { x.onclick = function () { proposeCorrection(r.id, d).catch(function (e) { A.toast(e.message, true); }); }; });
    if ((b = $('#close', el))) b.onclick = async function () {
      var saved = await A.modal({
        title: 'Close with no change', submit: 'Close',
        body: h`${field('Reason', h`<select name="reason">${options(d.reasons)}</select>`)}${field('Explanation', h`<textarea name="explanation" maxlength="500"></textarea>`)}`,
        onSubmit: function (v) { return api('api_saveShiftCorrection', r.id, d.version, A.uuid(), { reason: v.reason, explanation: v.explanation, patch: {}, status: 'COMPLETED' }); }
      });
      if (saved) { A.toast('Closed.'); A.render(); }
    };
  } });
  async function proposeCorrection(shiftId, d) {
    var cur = d.current;
    var externals = [{ value: 'NONE_CONFIRMED', label: 'Not exported, paid, billed or submitted' }, { value: 'EXPORTED', label: 'Exported to payroll' }, { value: 'PAID', label: 'Already paid' }, { value: 'BILLED', label: 'Already billed' }, { value: 'EVV_SUBMITTED', label: 'Submitted to EVV' }, { value: 'UNKNOWN', label: 'Not sure' }];
    var refsO = function (list) { return list.map(function (x) { return { value: x.id, label: x.label }; }); };
    var curTasks = cur.Tasks_Done ? String(cur.Tasks_Done).split(',') : [];
    var payload = await A.modal({
      title: 'Propose a correction', submit: 'Preview changes',
      body: h`${field('Reason', h`<select name="reason">${options(d.reasons)}</select>`)}${field('Explanation', h`<textarea name="explanation" maxlength="500"></textarea>`)}
        ${field('Caregiver', h`<select name="Assigned_Employee_ID">${options(refsO(d.references.caregivers), cur.Assigned_Employee_ID)}</select>`)}
        ${field('Client', h`<select name="Client_ID">${options(refsO(d.references.clients), cur.Client_ID, 'None')}</select>`)}
        ${field('Location', h`<select name="Location_ID">${options(refsO(d.references.locations), cur.Location_ID)}</select>`)}
        <div class="row"><label class="f" style="flex:2"><span>Service date</span><input type="date" name="Shift_Date" value="${cur.Shift_Date}"></label><label class="f" style="flex:1"><span>Start</span><input type="time" name="Start_Time" value="${cur.Start_Time}"></label><label class="f" style="flex:1"><span>End</span><input type="time" name="End_Time" value="${cur.End_Time}"></label></div>
        ${field('Clock in', h`<input type="datetime-local" name="Clock_In_Time" value="${A.isoToWall(cur.Clock_In_Time)}">`)}
        ${field('Clock out', h`<input type="datetime-local" name="Clock_Out_Time" value="${A.isoToWall(cur.Clock_Out_Time)}">`)}
        ${field('Worked hours (optional override)', h`<input type="number" step="0.01" min="0" name="Total_Hours" placeholder="${cur.Total_Hours}">`, 'Leave blank to use the clock times.')}
        <label class="f"><span>Care tasks</span><div class="chips">${d.tasks.map(function (t) { return h`<label><input type="checkbox" name="Tasks_Done[]" value="${t}" ${curTasks.indexOf(t) !== -1 ? 'checked' : ''}>${t}</label>`; })}</div></label>
        ${field('Family update', h`<textarea name="Family_Update" maxlength="500">${cur.Family_Update || ''}</textarea>`)}
        ${field('Administrative note', h`<textarea name="Administrative_Note" maxlength="500">${cur.Administrative_Note || ''}</textarea>`)}
        ${field('Has this visit already gone out anywhere?', h`<select name="external">${options(externals, 'NONE_CONFIRMED')}</select>`)}
        ${field('After saving', h`<select name="status">${options([{ value: 'PENDING_REAPPROVAL', label: 'Ready for reapproval' }, { value: 'CORRECTION_REQUIRED', label: 'Still needs correction' }])}</select>`)}`,
      onSubmit: function (v) {
        var patch = {};
        ['Assigned_Employee_ID', 'Client_ID', 'Location_ID', 'Shift_Date', 'Start_Time', 'End_Time', 'Family_Update', 'Administrative_Note'].forEach(function (k) { if (String(v[k] || '') !== String(cur[k] || '')) patch[k] = v[k] || ''; });
        ['Clock_In_Time', 'Clock_Out_Time'].forEach(function (k) { if (v[k] !== A.isoToWall(cur[k])) patch[k] = v[k] ? A.wallToOffset(v[k]) : ''; });
        if (v.Total_Hours !== '') patch.Total_Hours = Number(v.Total_Hours);
        var tasks = v.Tasks_Done || [];
        if (tasks.slice().sort().join(',') !== curTasks.slice().sort().join(',')) patch.Tasks_Done = tasks;
        return { reason: v.reason, explanation: v.explanation, patch: patch, status: v.status, external: v.external };
      }
    });
    if (!payload) return;
    var pv = await api('api_getShiftCorrectionPreview', shiftId, d.version, payload);
    var changed = Object.keys(FIELD_LABELS).filter(function (k) { return String(pv.before[k] == null ? '' : pv.before[k]) !== String(pv.after[k] == null ? '' : pv.after[k]); });
    var rv = pv.review || {};
    var go = await A.modal({
      title: 'Review the correction', submit: 'Save for reapproval',
      body: h`<p>${pv.reason}</p>${rowsTable(['Field', 'Before', 'After'], changed.map(function (k) { return h`<tr><td>${FIELD_LABELS[k]}</td><td>${showVal(k, pv.before[k], d)}</td><td><b>${showVal(k, pv.after[k], d)}</b></td></tr>`; }))}
        ${rv.adjustmentRequired ? h`<div class="notice warn">This will be flagged for a payroll adjustment.</div>` : ''}${rv.evvReview ? h`<div class="notice warn">Medicaid EVV visit — the EVV record must be corrected too.</div>` : ''}`
    });
    if (!go) return;
    await api('api_saveShiftCorrection', shiftId, d.version, A.uuid(), payload);
    A.toast(payload.status === 'PENDING_REAPPROVAL' ? 'Saved. Another administrator can now approve it.' : 'Saved.');
    A.render();
  }

  /* ========================================================= staff */
  A.route('staff', { title: 'Staff', wide: true, perm: 'staff.view_directory', view: async function (el, r, live) {
    A.setTitle('Staff');
    var list = await api('api_listEmployees');
    REF.employees = list;
    if (!live()) return;
    var q = r.query;
    el.innerHTML = h`<div class="page-head"><h1>Staff</h1>${can('staff.manage') ? h`<button class="btn primary" id="add">+ Add employee</button>` : ''}</div>
      <div class="filters"><input type="search" id="search" placeholder="Search name or email" value="${q.q || ''}"><select id="role">${options(['CAREGIVER', 'SCHEDULER', 'ADMIN'], q.role || '', 'All roles')}</select><select id="st">${options([{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }], q.st || 'ACTIVE', 'Any status')}</select></div>
      <div class="list" id="people"></div>`.s;
    function draw() {
      var s = $('#search', el).value.toLowerCase(), role = $('#role', el).value, st = $('#st', el).value;
      var rows = list.filter(function (e) {
        return (!s || (e.First_Name + ' ' + e.Last_Name + ' ' + e.Email).toLowerCase().indexOf(s) !== -1) && (!role || e.Role === role) && (!st || String(e.Employment_Status).trim().toUpperCase() === st);
      }).sort(function (a, b) { return (a.First_Name + a.Last_Name).localeCompare(b.First_Name + b.Last_Name); });
      $('#people', el).innerHTML = rows.length ? h`${rows.map(function (e) { return h`<div class="item tap" data-go="employee/${e.Employee_ID}"><div class="body"><b>${e.First_Name} ${e.Last_Name}</b><span>${e.Email}${e.Phone ? ' · ' + e.Phone : ''}</span></div>${badge(e.Role)}${isActive(e) ? '' : badge('INACTIVE')}</div>`; })}`.s : '<div class="empty">No one matches.</div>';
      A.wireGo(el);
    }
    ['search', 'role', 'st'].forEach(function (id) { $('#' + id, el).oninput = draw; });
    draw();
    var add = $('#add', el); if (add) add.onclick = async function () { var rec = await employeeForm(); if (rec) { invalidate('employees'); A.go('employee/' + rec.Employee_ID); } };
  } });
  var WELCOME = { SENT: 'Welcome email with a sign-in code was sent.', NOT_CONFIGURED: 'No welcome email: set Portal_Public_URL in Settings to this app’s address.', DISABLED: 'No welcome email: email notifications are switched off in Settings.', FAILED: 'The welcome email could not be sent. They can still request a code on the sign-in screen.' };
  async function employeeForm(e) {
    e = e || {};
    var isNew = !e.Employee_ID;
    var roles = can('role.manage') ? ['CAREGIVER', 'SCHEDULER', 'ADMIN'] : ['CAREGIVER'];
    return A.modal({
      title: isNew ? 'Add employee' : 'Edit ' + e.First_Name, submit: isNew ? 'Create & send welcome' : 'Save',
      body: h`<div class="row"><label class="f" style="flex:1"><span>First name</span><input type="text" name="First_Name" required value="${e.First_Name || ''}"></label><label class="f" style="flex:1"><span>Last name</span><input type="text" name="Last_Name" required value="${e.Last_Name || ''}"></label></div>
        ${isNew ? field('Email', h`<input type="email" name="Email" required>`, 'They sign in with this address.') : ''}
        ${field('Phone', h`<input type="text" name="Phone" inputmode="tel" value="${e.Phone || ''}">`)}
        ${isNew ? field('Role', h`<select name="Role">${options(roles, 'CAREGIVER')}</select>`) : ''}
        ${field('Hire date', h`<input type="date" name="Hire_Date" value="${e.Hire_Date || todayStr()}">`)}
        ${can('staff.view_pay') ? field('Hourly rate ($)', h`<input type="number" step="0.01" min="0" name="Hourly_Rate" value="${e.Hourly_Rate == null ? '' : e.Hourly_Rate}">`) : ''}
        ${field('Maximum weekly hours', h`<input type="number" min="0" name="Maximum_Weekly_Hours" value="${e.Maximum_Weekly_Hours || 40}">`)}
        ${field('Service areas', h`<input type="text" name="Service_Areas" value="${e.Service_Areas || ''}">`)}
        ${field('Qualifications (notes)', h`<input type="text" name="Qualifications" value="${e.Qualifications || ''}">`, 'Use Credentials on their profile for verified, expiring certificates.')}`,
      onSubmit: async function (v) {
        if (!v.First_Name || !v.Last_Name) throw new Error('First and last name are required.');
        if (isNew) {
          var rec = await api('api_createEmployee', v);
          A.toast('Employee created. ' + (WELCOME[rec.Welcome_Email_Status] || ''), rec.Welcome_Email_Status !== 'SENT');
          return rec;
        }
        var patch = {};
        Object.keys(v).forEach(function (k) { if (String(v[k]) !== String(e[k] == null ? '' : e[k])) patch[k] = v[k]; });
        if (!Object.keys(patch).length) return true;
        return api('api_updateEmployee', e.Employee_ID, patch);
      }
    });
  }
  A.route('employee', { title: 'Employee', tab: 'staff', wide: true, perm: 'staff.view_directory', view: async function (el, r, live) {
    A.setTitle('Employee');
    var parts = [['api_getEmployee', r.id], ['api_listQualifications', r.id]];
    if (can('availability.view_all')) parts.push(['api_listEmployeeAvailability', r.id]);
    parts.push(['api_listShiftsForManagement', { employeeId: r.id, dateFrom: todayStr(), dateTo: addDays(todayStr(), 21) }]);
    var res = await A.batch(parts);
    if (!live()) return;
    var e = A.ok(res[0]), quals = res[1] instanceof Error ? [] : res[1];
    var avail = can('availability.view_all') ? (res[2] instanceof Error ? [] : res[2]) : [];
    var shifts = res[res.length - 1] instanceof Error ? [] : res[res.length - 1];
    var t = todayStr();
    avail = avail.filter(function (a) { return a.Date >= t; }).slice(0, 14);
    var active = isActive(e);
    el.innerHTML = h`<div class="card"><div class="row between"><h2>${e.First_Name} ${e.Last_Name}</h2><div>${badge(e.Role)} ${badge(active ? 'ACTIVE' : 'INACTIVE')}</div></div>
        <dl class="kv" style="margin-top:10px"><dt>Email</dt><dd><a href="mailto:${e.Email}">${e.Email}</a></dd><dt>Phone</dt><dd>${e.Phone ? h`<a href="tel:${e.Phone}">${e.Phone}</a>` : '—'}</dd>
        <dt>Hire date</dt><dd>${e.Hire_Date ? fmtDate(e.Hire_Date, { year: 'numeric' }) : '—'}</dd>${e.Hourly_Rate !== undefined ? h`<dt>Hourly rate</dt><dd>$${e.Hourly_Rate}</dd>` : ''}
        <dt>Max weekly hours</dt><dd>${e.Maximum_Weekly_Hours || '—'}</dd><dt>Service areas</dt><dd>${e.Service_Areas || '—'}</dd><dt>Notes</dt><dd>${e.Qualifications || '—'}</dd></dl>
        <div class="actions">${can('staff.manage') ? h`<button class="btn" id="edit">Edit</button><button class="btn ${active ? 'danger' : ''}" id="act">${active ? 'Deactivate' : 'Reactivate'}</button>` : ''}
          ${can('role.manage') ? h`<button class="btn" id="role">Change role</button>` : ''}<a class="btn" href="#/shifts?${qs({ emp: e.Employee_ID, from: t, to: addDays(t, 30) })}">Shifts</a><a class="btn" href="#/time?${qs({ emp: e.Employee_ID })}">Time</a></div></div>
      <div class="section-title">Credentials</div>
      <div class="list">${quals.map(function (q) {
        var soon = q.Expiration_Date && q.Expiration_Date <= addDays(t, 30);
        return h`<div class="item"><div class="body"><b>${q.Qualification_Type}</b><span>${q.Issue_Date ? 'Issued ' + fmtDate(q.Issue_Date, { year: 'numeric' }) + ' · ' : ''}Expires ${fmtDate(q.Expiration_Date, { year: 'numeric' })}${soon ? ' — soon' : ''}</span></div>${badge(q.Verification_Status)}
          ${q.Verification_Status === 'PENDING' && can('qualification.manage') ? h`<button class="btn sm primary" data-v="${q.Qualification_ID}" data-ok="1">Verify</button><button class="btn sm danger" data-v="${q.Qualification_ID}" data-ok="0">Reject</button>` : ''}</div>`;
      })}${!quals.length ? h`<div class="empty">No credentials on file.</div>` : ''}</div>
      ${can('qualification.manage') ? h`<button class="btn" id="addq">+ Add credential</button>` : ''}
      ${shifts.length ? h`<div class="section-title">Next three weeks</div><div class="list">${shifts.map(function (s) { return A.shiftItem(s); })}</div>` : ''}
      ${can('availability.view_all') ? h`<div class="section-title">Availability</div>${avail.length ? h`<div class="list">${avail.map(function (a) { return h`<div class="item">${A.dateTile(a.Date)}<div class="body"><b>${a.Available_From ? fmtTime(a.Available_From) + ' – ' + fmtTime(a.Available_To) : 'All day'}</b><span>${a.Note || ''}</span></div>${badge(a.Availability_Status)}</div>`; })}</div>` : h`<div class="card empty">No upcoming availability set.</div>`}` : ''}`.s;
    A.wireGo(el);
    var b;
    if ((b = $('#edit', el))) b.onclick = async function () { if (await employeeForm(e)) { invalidate('employees'); A.toast('Saved.'); A.render(); } };
    if ((b = $('#act', el))) b.onclick = async function () {
      if (active) {
        var why = await A.askText('Deactivate ' + e.First_Name + '?', 'Reason', { intro: 'They are signed out immediately and stop receiving shifts and reminders.', submit: 'Deactivate', danger: true });
        if (why == null) return;
        try { await api('api_setEmployeeActive', e.Employee_ID, false, why); A.toast('Deactivated.'); invalidate('employees'); A.render(); } catch (x) { A.toast(x.message, true); }
      } else if (await A.confirmBox('Reactivate ' + e.First_Name + '?', 'They can sign in again.', 'Reactivate')) {
        try { await api('api_setEmployeeActive', e.Employee_ID, true, ''); A.toast('Reactivated.'); invalidate('employees'); A.render(); } catch (x) { A.toast(x.message, true); }
      }
    };
    if ((b = $('#role', el))) b.onclick = async function () {
      var done = await A.modal({ title: 'Change role', submit: 'Save', body: field('Role', h`<select name="role">${options(['CAREGIVER', 'SCHEDULER', 'ADMIN'], e.Role)}</select>`), onSubmit: function (v) { return api('api_setEmployeeRole', e.Employee_ID, v.role); } });
      if (done) { invalidate('employees'); A.toast('Role updated.'); A.render(); }
    };
    if ((b = $('#addq', el))) b.onclick = async function () {
      var done = await A.modal({
        title: 'Add credential', submit: 'Add',
        body: h`${field('Type', h`<input type="text" name="Qualification_Type" required placeholder="e.g. CPR, CNA">`, 'Must match the wording used in a shift’s Required qualifications.')}${field('Issue date', h`<input type="date" name="Issue_Date">`)}${field('Expiration date', h`<input type="date" name="Expiration_Date" required>`)}`,
        onSubmit: function (v) { v.Employee_ID = e.Employee_ID; return api('api_addQualification', v); }
      });
      if (done) { A.toast('Added. Verify it once you have seen the certificate.'); A.render(); }
    };
    $$('[data-v]', el).forEach(function (x) { x.onclick = function () { A.act(x, '…', async function () { await api('api_verifyQualification', x.dataset.v, x.dataset.ok === '1'); A.toast('Saved.'); A.render(); }); }; });
  } });

  /* ========================================================= locations */
  async function locationForm(loc) {
    loc = loc || {};
    var lookup = null, chosen = null;
    return A.modal({
      title: loc.Location_ID ? 'Edit location' : 'Add service location', submit: 'Save location',
      body: h`${field('Label', h`<input type="text" name="Location_Label" required maxlength="120" value="${loc.Location_Label || ''}" placeholder="e.g. Smith residence">`, 'Caregivers see this once they are assigned.')}
        ${field('General area', h`<input type="text" name="General_Service_Area" required maxlength="120" value="${loc.General_Service_Area || ''}" placeholder="e.g. Towson">`, 'Shown on open shifts before anyone is assigned.')}
        ${field('Street address', h`<input type="text" name="Street_Address" required value="${loc.Street_Address || ''}" placeholder="Street, city, state ZIP">`)}
        <button type="button" class="btn" id="look">${icon('pin')} Find on map</button>
        <div id="cands" style="margin-top:10px"></div><div id="map"></div>
        ${field('Clock-in radius', h`<select name="Geofence_Radius_Miles">${options([{ value: '', label: 'Default' }, { value: '0.25', label: '0.25 mile' }, { value: '0.5', label: '0.5 mile' }], loc.Geofence_Radius_Miles == null ? '' : String(loc.Geofence_Radius_Miles))}</select>`)}
        <label class="check"><input type="checkbox" name="Map_Confirmed"> The map pin marks the correct front door / building</label>`,
      onOpen: function (form) {
        $('#look', form).onclick = function () {
          var btn = this;
          A.act(btn, 'Looking up…', async function () {
            lookup = null; chosen = null; $('#map', form).innerHTML = '';
            var res = await api('api_getAddressCandidates', form.Street_Address.value.trim(), loc.Location_ID || '', loc.Edit_Version || '');
            if (!res.candidates.length) { $('#cands', form).innerHTML = '<div class="notice warn">No exact match found. Check the street number, city and ZIP.</div>'; return; }
            lookup = res;
            $('#cands', form).innerHTML = h`<p class="small muted">Choose the match:</p>${res.candidates.map(function (c, i) { return h`<label class="check"><input type="radio" name="cand" value="${i}">${c.address}</label>`; })}`.s;
            $$('input[name=cand]', form).forEach(function (rb) {
              rb.onchange = function () {
                chosen = Number(rb.value); form.Street_Address.value = form.Street_Address.value.trim();
                $('#map', form).innerHTML = '<div class="loading">Loading map…</div>';
                api('api_getLocationMap', lookup.lookupId, chosen).then(function (m) { $('#map', form).innerHTML = h`<img class="map-preview" src="${m.image}" alt="Map preview">`.s; })
                  .catch(function (e) { var c = lookup.candidates[chosen]; $('#map', form).innerHTML = h`<div class="notice warn">${e.message} <a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${c.latitude},${c.longitude}">Open in Google Maps</a></div>`.s; });
              };
            });
          });
        };
        form.Street_Address.oninput = function () { lookup = null; chosen = null; $('#cands', form).innerHTML = ''; $('#map', form).innerHTML = ''; };
      },
      onSubmit: function (v) {
        if (!lookup || chosen == null) throw new Error('Tap “Find on map” and choose the matching address.');
        if (!v.Map_Confirmed) throw new Error('Confirm that the map pin is in the right place.');
        var payload = { Location_Label: v.Location_Label, General_Service_Area: v.General_Service_Area, Street_Address: v.Street_Address, Geofence_Radius_Miles: v.Geofence_Radius_Miles, Lookup_ID: lookup.lookupId, Candidate_Index: chosen, Map_Confirmed: true };
        return loc.Location_ID ? api('api_editLocation', loc.Location_ID, payload) : api('api_createLocation', payload);
      }
    });
  }
  A.route('locations', { title: 'Service locations', tab: 'more', wide: true, perm: 'shift.view_all', view: async function (el, r, live) {
    A.setTitle('Service locations');
    var list = await api('api_listLocations');
    REF.locations = list;
    if (!live()) return;
    el.innerHTML = h`<div class="page-head"><div><h1>Service locations</h1><p>Each location’s map pin is what GPS clock-in is checked against.</p></div>${can('site.manage') ? h`<button class="btn primary" id="add">+ Add location</button>` : ''}</div>
      ${list.length ? h`<div class="list">${list.map(function (l, i) {
        var active = A.isTrue(l.Active_Status);
        return h`<div class="item"><div class="body"><b>${l.Location_Label}</b><span>${l.Street_Address} · ${l.General_Service_Area}</span><span class="small">Radius ${l.Geofence_Radius_Miles ? l.Geofence_Radius_Miles + ' mi' : 'default'}${l.Coordinates_Source ? ' · pin confirmed' : ' · pin not confirmed'}</span></div>
          ${active ? '' : badge('INACTIVE')}${can('site.manage') ? h`<button class="btn sm" data-e="${i}">Edit</button><button class="btn sm" data-r="${i}">Radius</button><button class="btn sm ${active ? 'danger' : ''}" data-a="${i}">${active ? 'Deactivate' : 'Activate'}</button>` : ''}</div>`;
      })}</div>` : h`<div class="card empty">No service locations yet.</div>`}`.s;
    var add = $('#add', el); if (add) add.onclick = async function () { if (await locationForm()) { A.toast('Location added.'); invalidate('locations'); A.render(); } };
    $$('[data-e]', el).forEach(function (b) { b.onclick = async function () { if (await locationForm(list[Number(b.dataset.e)])) { A.toast('Location updated.'); invalidate('locations'); A.render(); } }; });
    $$('[data-r]', el).forEach(function (b) {
      b.onclick = async function () {
        var l = list[Number(b.dataset.r)];
        var done = await A.modal({ title: 'Clock-in radius', submit: 'Save', body: field(l.Location_Label, h`<select name="m">${options([{ value: '', label: 'Default' }, { value: '0.25', label: '0.25 mile' }, { value: '0.5', label: '0.5 mile' }], l.Geofence_Radius_Miles == null ? '' : String(l.Geofence_Radius_Miles))}</select>`), onSubmit: function (v) { return api('api_setLocationRadius', l.Location_ID, v.m); } });
        if (done) { A.toast('Radius saved.'); A.render(); }
      };
    });
    $$('[data-a]', el).forEach(function (b) { b.onclick = function () { var l = list[Number(b.dataset.a)]; A.act(b, '…', async function () { await api('api_setLocationActive', l.Location_ID, !A.isTrue(l.Active_Status)); invalidate('locations'); A.render(); }); }; });
  } });

  /* ========================================================= clients & families */
  A.route('clients', { title: 'Clients & families', tab: 'more', wide: true, perm: 'client.view_all', view: async function (el, r, live) {
    A.setTitle('Clients & families');
    await refs(true);
    if (!live()) return;
    var list = REF.clients;
    el.innerHTML = h`<div class="page-head"><div><h1>Clients</h1><p>Store a display name only (e.g. “Mom” or “Mary”) — no medical details.</p></div>${can('client.manage') ? h`<button class="btn primary" id="add">+ Add client</button>` : ''}</div>
      ${list.length ? h`<div class="list">${list.map(function (c) {
        return h`<div class="item tap" data-go="client/${c.Client_ID}"><div class="body"><b>${c.Display_Name}</b><span>${c.Location_ID ? (REF.locations.filter(function (l) { return l.Location_ID === c.Location_ID; })[0] || {}).Location_Label || '' : 'No location'} · ${c.Active_Contacts} family contact${c.Active_Contacts === 1 ? '' : 's'}</span></div>${A.isTrue(c.Active_Status) ? '' : badge('INACTIVE')}</div>`;
      })}</div>` : h`<div class="card empty">No clients yet.</div>`}`.s;
    A.wireGo(el);
    var add = $('#add', el); if (add) add.onclick = async function () { var rec = await clientForm(); if (rec) { A.toast('Client added.'); A.render(); } };
  } });
  function clientForm(c) {
    c = c || {};
    return A.modal({
      title: c.Client_ID ? 'Edit client' : 'Add client', submit: 'Save',
      body: h`${field('Name the family sees', h`<input type="text" name="Display_Name" required maxlength="60" value="${c.Display_Name || ''}">`)}${field('Service location', h`<select name="Location_ID">${locationOptions(c.Location_ID, 'None')}</select>`)}
        <label class="check"><input type="checkbox" name="active" ${c.Client_ID && !A.isTrue(c.Active_Status) ? '' : 'checked'}> Active</label>`,
      onSubmit: function (v) { return api('api_saveClient', { Client_ID: c.Client_ID || '', Display_Name: v.Display_Name, Location_ID: v.Location_ID, Active_Status: v.active ? 'TRUE' : 'FALSE' }); }
    });
  }
  function contactForm(clientId, f) {
    f = f || {};
    return A.modal({
      title: f.Contact_ID ? 'Edit family contact' : 'Give a family member access', submit: 'Save',
      body: h`${field('Name', h`<input type="text" name="Name" required maxlength="80" value="${f.Name || ''}">`)}${field('Email', h`<input type="email" name="Email" required value="${f.Email || ''}">`, 'They sign in on the Family tab with this email.')}
        ${field('Relationship', h`<input type="text" name="Relationship" maxlength="40" value="${f.Relationship || ''}" placeholder="e.g. Daughter">`)}
        <label class="check"><input type="checkbox" name="active" ${f.Contact_ID && !A.isTrue(f.Active_Status) ? '' : 'checked'}> Has access</label>`,
      onSubmit: function (v) { return api('api_saveFamilyContact', { Contact_ID: f.Contact_ID || '', Client_ID: clientId, Name: v.Name, Email: v.Email, Relationship: v.Relationship, Active_Status: v.active ? 'TRUE' : 'FALSE' }); }
    });
  }
  A.route('client', { title: 'Client', tab: 'more', wide: true, perm: 'client.view_all', view: async function (el, r, live) {
    await refs(true);
    var c = REF.clients.filter(function (x) { return x.Client_ID === r.id; })[0];
    var contacts = can('family.manage') ? await api('api_listFamilyContacts', r.id) : null;
    if (!live()) return;
    if (!c) { el.innerHTML = h`<div class="card empty">Client not found.</div>`.s; return; }
    A.setTitle(c.Display_Name);
    el.innerHTML = h`<div class="card"><div class="row between"><h2>${c.Display_Name}</h2>${badge(A.isTrue(c.Active_Status) ? 'ACTIVE' : 'INACTIVE')}</div>
        <p class="muted">${c.Location_ID ? (REF.locations.filter(function (l) { return l.Location_ID === c.Location_ID; })[0] || {}).Street_Address || '' : 'No service location linked'}</p>
        <div class="actions">${can('client.manage') ? h`<button class="btn" id="edit">Edit</button>` : ''}<a class="btn" href="#/shifts?${qs({ from: todayStr(), to: addDays(todayStr(), 30) })}">Shifts</a></div></div>
      <div class="section-title">Family access</div>
      ${contacts == null ? h`<div class="card empty">Only administrators manage family access.</div>` : h`
        <div class="list">${contacts.map(function (f, i) { return h`<div class="item tap" data-i="${i}"><div class="body"><b>${f.Name}${f.Relationship ? ' · ' + f.Relationship : ''}</b><span>${f.Email}</span></div>${badge(A.isTrue(f.Active_Status) ? 'ACTIVE' : 'INACTIVE', A.isTrue(f.Active_Status) ? 'Has access' : 'Removed')}</div>`; })}
        ${!contacts.length ? h`<div class="empty">No family members have access yet.</div>` : ''}</div>
        <button class="btn primary" id="addf">+ Give a family member access</button>
        <p class="small muted">Families see only: who is coming and when, verified arrival/finish times, and updates you approve.</p>`}`.s;
    var b;
    if ((b = $('#edit', el))) b.onclick = async function () { if (await clientForm(c)) { A.toast('Saved.'); A.render(); } };
    if ((b = $('#addf', el))) b.onclick = async function () { if (await contactForm(c.Client_ID)) { A.toast('Access granted. They can sign in on the Family tab.'); A.render(); } };
    $$('[data-i]', el).forEach(function (it) { it.onclick = async function () { if (await contactForm(c.Client_ID, contacts[Number(it.dataset.i)])) { A.toast('Saved.'); A.render(); } }; });
  } });

  A.route('familyupdates', { title: 'Family updates', tab: 'more', wide: true, perm: 'visit.approve_family_update', view: async function (el, r, live) {
    A.setTitle('Family updates');
    var list = await api('api_listPendingFamilyUpdates');
    if (!live()) return;
    el.innerHTML = h`<div class="page-head"><div><h1>Family updates to approve</h1><p>Nothing reaches a family until you approve it. Rewrite the caregiver’s note into what the family should read.</p></div></div>
      ${list.length ? list.map(function (u, i) {
        return h`<div class="card"><div class="row between"><b>${u.clientName}</b><span class="small muted">${fmtDate(u.shiftDate)} · ${fmtTime(u.startTime)}–${fmtTime(u.endTime)}</span></div>
          <p class="small muted">Caregiver: ${u.caregiverName}</p><p>${(u.tasks || []).join(', ') || 'No tasks ticked.'}</p>${u.staffNote ? h`<p class="muted">“${u.staffNote}”</p>` : ''}
          <div class="actions"><button class="btn primary" data-ap="${i}">Approve for family</button><button class="btn danger" data-wh="${i}">Don’t share</button><a class="btn ghost" href="#/shift/${u.shiftId}">Shift</a></div></div>`;
      }) : h`<div class="card empty">No updates waiting.</div>`}`.s;
    $$('[data-ap]', el).forEach(function (b) {
      b.onclick = async function () {
        var u = list[Number(b.dataset.ap)];
        var tasksAll = ['Personal care', 'Meal preparation', 'Light housekeeping', 'Mobility assistance', 'Medication reminder', 'Companionship', 'Laundry', 'Errands or transportation'];
        var done = await A.modal({
          title: 'Approve update for ' + u.clientName, submit: 'Share with family',
          body: h`<label class="f"><span>Care provided</span><div class="chips">${tasksAll.map(function (t) { return h`<label><input type="checkbox" name="tasks[]" value="${t}" ${(u.tasks || []).indexOf(t) !== -1 ? 'checked' : ''}>${t}</label>`; })}</div></label>
            ${field('Message the family will read', h`<textarea name="text" maxlength="500">${u.familyUpdate || u.staffNote || ''}</textarea>`, 'Keep it warm and non-medical. 500 characters max.')}`,
          onSubmit: function (v) { return api('api_approveFamilyUpdate', u.shiftId, v.text, v.tasks || []); }
        });
        if (done) { A.toast('Shared. The family was emailed to sign in and read it.'); A.render(); }
      };
    });
    $$('[data-wh]', el).forEach(function (b) {
      b.onclick = async function () {
        var u = list[Number(b.dataset.wh)];
        var why = await A.askText('Don’t share this visit', 'Reason (internal)', { submit: 'Withhold', danger: true, required: false });
        if (why == null) return;
        try { await api('api_withholdFamilyUpdate', u.shiftId, why); A.toast('Withheld.'); A.render(); } catch (e) { A.toast(e.message, true); }
      };
    });
  } });

  /* ========================================================= settings & audit */
  var BOOL_SETTINGS = ['Email_Notifications_Enabled', 'Show_Hourly_Rate_To_Caregiver', 'Allow_Self_Approval_Shift_Corrections', 'Scheduler_Can_Review_Overrides', 'Scheduler_Can_Approve_Family_Updates'];
  var CHOICE_SETTINGS = { Geofence_Radius_Miles: ['0.25', '0.5'], Payroll_Period_Type: ['WEEKLY', 'BIWEEKLY'], Workweek_Start_Day: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] };
  A.route('settings', { title: 'Settings', tab: 'more', wide: true, perm: 'system.manage', view: async function (el, r, live) {
    A.setTitle('Settings');
    var list = await api('api_listSettings');
    if (!live()) return;
    el.innerHTML = h`<div class="page-head"><div><h1>Settings</h1><p>Changes apply to everyone right away and are recorded in the audit log.</p></div></div>
      ${list.filter(function (s) { return s.Setting_Key !== 'Geofence_Radius_Meters' && s.Setting_Key !== 'Time_Zone'; }).map(function (s) {
        var input = BOOL_SETTINGS.indexOf(s.Setting_Key) !== -1 ? h`<select name="v">${options([{ value: 'TRUE', label: 'On' }, { value: 'FALSE', label: 'Off' }], String(s.Setting_Value).toUpperCase())}</select>`
          : CHOICE_SETTINGS[s.Setting_Key] ? h`<select name="v">${options(CHOICE_SETTINGS[s.Setting_Key], String(s.Setting_Value))}</select>`
          : s.Setting_Key === 'Payroll_Anchor_Date' ? h`<input type="date" name="v" value="${s.Setting_Value}">`
          : h`<input type="text" name="v" value="${s.Setting_Value}">`;
        return h`<form class="card" data-k="${s.Setting_Key}"><label class="f" style="margin:0"><span>${s.Setting_Key.replace(/_/g, ' ')}</span><small style="margin:0 0 6px">${s.Description}</small></label>
          <div class="row">${raw('<div style="flex:1">')}${input}${raw('</div>')}<button class="btn sm primary" type="submit">Save</button></div></form>`;
      })}`.s;
    $$('form[data-k]', el).forEach(function (f) {
      f.onsubmit = function (e) { e.preventDefault(); A.act($('button', f), 'Saving…', async function () { await api('api_updateSetting', f.dataset.k, f.v.value); A.toast('Saved.'); }); };
    });
  } });

  A.route('audit', { title: 'Audit log', tab: 'more', wide: true, perm: 'audit.view', view: async function (el, r, live) {
    A.setTitle('Audit log');
    var f = {}; if (r.query.action) f.action = r.query.action;
    var list = await api('api_listAuditLog', f);
    if (!live()) return;
    var actions = {}; list.forEach(function (a) { actions[a.Action] = true; });
    el.innerHTML = h`<div class="page-head"><div><h1>Audit log</h1><p>Latest 200 events, newest first. Read-only.</p></div><select id="act" style="max-width:260px">${options(Object.keys(actions).sort(), r.query.action || '', 'All actions')}</select></div>
      ${rowsTable(['When', 'Who', 'Action', 'Record', 'Reason'], list.map(function (a, i) {
        return h`<tr data-i="${i}" style="cursor:pointer"><td>${fmtDT(a.Timestamp)}</td><td>${a.User_Email}<br><span class="small muted">${a.User_Role}</span></td><td>${a.Action}</td><td class="mono">${a.Record_Type} ${a.Record_ID}</td><td>${a.Reason}</td></tr>`;
      }))}`.s;
    $('#act', el).onchange = function () { A.go('audit' + (this.value ? '?action=' + encodeURIComponent(this.value) : '')); };
    $$('tr[data-i]', el).forEach(function (tr) {
      tr.onclick = function () {
        var a = list[Number(tr.dataset.i)];
        function pretty(v) { try { return JSON.stringify(JSON.parse(v), null, 2); } catch (e) { return v; } }
        A.modal({ title: a.Action, submit: false, cancel: 'Close', body: h`<p class="small muted">${fmtDT(a.Timestamp)} · ${a.User_Email}</p>${a.Previous_Value ? h`<p><b>Before</b></p><pre class="json">${pretty(a.Previous_Value)}</pre>` : ''}${a.New_Value ? h`<p><b>After</b></p><pre class="json">${pretty(a.New_Value)}</pre>` : ''}${a.Device_Information ? h`<p class="small muted">${a.Device_Information}</p>` : ''}` });
      };
    });
  } });
})();
