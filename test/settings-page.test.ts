// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

/**
 * The app settings page, its script run unchanged against a stand-in for its routes and app settings (the strings are
 * their keys, tokens as JSON). `routes(method, path, body)` answers a call; anything else answers `{}`.
 */
function loadPage(routes: (method: string, path: string, body: any) => any, settings: Record<string, any> = {}) {
  const html = readFileSync('settings/index.html', 'utf8');
  document.body.innerHTML = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script type="text/javascript">', html.indexOf('<body>')));
  const script = html.slice(html.indexOf('function onHomeyReady'), html.lastIndexOf('</script>'));
  const calls: any[] = [];
  const Homey = {
    __: (k: string, tokens?: any) => `${k.replace('settings.', '')}${tokens ? JSON.stringify(tokens) : ''}`,
    get: (k: string, cb: any) => cb(null, settings[k]),
    ready: () => {},
    set: (k: string, v: any, cb: any) => { settings[k] = v; cb(null); },
    api: (method: string, path: string, body: any, cb: any) => {
      calls.push([method, path, body]);
      cb(null, routes(method, path, body) ?? {});
    },
  };
  new Function('Homey', `${script}\nonHomeyReady(Homey);`)(Homey);
  const $ = (id: string) => document.getElementById(id) as HTMLInputElement;
  const typeIn = (id: string, v: string) => { $(id).value = v; $(id).dispatchEvent(new Event('input')); };
  const click = (id: string) => ($(id) as unknown as HTMLButtonElement).click();
  return { calls, $, typeIn, click };
}

it('Keypad codes: adds, changes with the current code, and removes with a second tap', () => {
  let codes: any[] = [];
  const { calls, $, typeIn, click } = loadPage((method, path, body) => {
    if (path === '/keypad-codes' && method === 'GET') return { codes };
    if (path === '/keypad-codes' && method === 'POST') { codes = [...codes, { id: 'a1', name: body.name, digits: body.code.length }]; return { ok: true, codes }; }
    if (path.startsWith('/keypad-codes/') && method === 'PUT') {
      if (body.current !== '4711') return { ok: false, reason: 'wrongCode' };
      codes = codes.map(c => ({ ...c, digits: body.code.length })); return { ok: true, codes };
    }
    if (path.startsWith('/keypad-codes/') && method === 'DELETE') { codes = []; return { ok: true, codes }; }
  });
  expect($('kpLine').textContent).toBe('kpNone');
  // The form opens on Add code, in place of the button.
  expect([$('kpForm').hidden, $('kpActions').hidden]).toEqual([true, false]);
  click('kpNew');
  expect([$('kpForm').hidden, $('kpActions').hidden]).toEqual([false, true]);
  typeIn('kpName', 'Alarm');
  typeIn('kpCode', '47a11');
  expect($('kpCode').value).toBe('4711');
  expect($('kpSave').disabled).toBe(true);
  typeIn('kpAgain', '4712');
  click('kpSave');
  expect($('kpStatus').textContent).toBe('kpMismatch');
  typeIn('kpAgain', '4711');
  click('kpSave');
  expect(calls.at(-1)).toEqual(['POST', '/keypad-codes', { name: 'Alarm', code: '4711' }]);
  expect(document.querySelector('#kpList li')!.textContent).toBe('AlarmkpDigits{"n":4}kpChangekpRemove');
  expect($('kpStatus').textContent).toBe('kpAdded');
  expect([$('kpForm').hidden, $('kpLine').textContent]).toEqual([true, 'Alarm']);
  // Change: the current code, then new digits twice.
  (document.querySelectorAll('#kpList button')[0] as HTMLButtonElement).click();
  expect([$('kpForm').hidden, $('kpNameGroup').hidden, $('kpCurrentGroup').hidden, $('kpChanging').textContent]).toEqual([false, true, false, 'kpChanging{"name":"Alarm"}']);
  typeIn('kpCurrent', '0000'); typeIn('kpCode', '246810'); typeIn('kpAgain', '246810');
  click('kpSave');
  expect($('kpStatus').textContent).toBe('kpWrong');
  typeIn('kpCurrent', '4711');
  click('kpSave');
  expect(calls.at(-1)).toEqual(['PUT', '/keypad-codes/a1', { current: '4711', code: '246810' }]);
  expect(document.querySelector('#kpList li')!.textContent).toContain('kpDigits{"n":6}');
  expect([$('kpForm').hidden, $('kpNameGroup').hidden]).toEqual([true, false]);
  // Remove: a second tap.
  const remove = () => document.querySelectorAll('#kpList button')[1] as HTMLButtonElement;
  remove().click();
  expect(remove().textContent).toBe('kpRemoveAgain');
  remove().click();
  expect(calls.at(-1)).toEqual(['DELETE', '/keypad-codes/a1', null]);
  expect($('kpLine').textContent).toBe('kpNone');
  expect($('kpStatus').textContent).toBe('kpRemoved');
});

it('Keypad codes: adding another takes one of the codes already made', () => {
  let codes: any[] = [{ id: 'a1', name: 'Alarm', digits: 4 }];
  const { calls, $, typeIn, click } = loadPage((method, path, body) => {
    if (path === '/keypad-codes' && method === 'GET') return { codes };
    if (path === '/keypad-codes' && method === 'POST') {
      if (body.current !== '4711') return { ok: false, reason: 'wrongCode' };
      codes = [...codes, { id: 'b2', name: body.name, digits: body.code.length }]; return { ok: true, codes };
    }
    if (path.startsWith('/keypad-codes/') && method === 'DELETE') { codes = []; return { ok: true, codes }; }
  });
  click('kpNew');
  expect([$('kpCurrentGroup').hidden, $('kpCurrent').placeholder]).toEqual([false, 'kpExisting']);
  typeIn('kpName', 'Kids'); typeIn('kpCode', '2580'); typeIn('kpAgain', '2580');
  expect($('kpSave').disabled).toBe(true); // not without a code
  typeIn('kpCurrent', '1111');
  click('kpSave');
  expect($('kpStatus').textContent).toBe('kpNotACode');
  typeIn('kpCurrent', '4711');
  click('kpSave');
  expect(calls.at(-1)).toEqual(['POST', '/keypad-codes', { name: 'Kids', code: '2580', current: '4711' }]);
  expect($('kpLine').textContent).toBe('Alarm, Kids');
  // A row's Change asks for its current one, by that name.
  (document.querySelectorAll('#kpList button')[0] as HTMLButtonElement).click();
  expect([$('kpCurrentGroup').hidden, $('kpCurrent').placeholder]).toEqual([false, 'kpCurrent']);
  // With every code removed, the next is the first again and takes none.
  $('kpCancel').click();
  const remove = () => document.querySelectorAll('#kpList button')[1] as HTMLButtonElement;
  remove().click(); remove().click();
  click('kpNew');
  expect($('kpCurrentGroup').hidden).toBe(true);
});

it('API key: the field without a key, Replace key and Remove with one; the line says which', () => {
  let set = false;
  const { calls, $, typeIn, click } = loadPage((method, path, body) => {
    if (path === '/variables-key' && method === 'GET') return { set };
    if (path === '/variables-key' && method === 'PUT') { set = !!body.key; return { ok: true, variables: true, flows: true }; }
  });
  expect([$('varLine').textContent, $('varLine').classList.contains('ok'), $('varState').hidden]).toEqual(['varLineNone', false, false]);
  expect([$('varForm').hidden, $('varActions').hidden, $('varCancel').hidden]).toEqual([false, true, true]);
  typeIn('varKey', ' k1 ');
  click('varSave');
  expect(calls.at(-1)).toEqual(['GET', '/variables-key', null]);
  expect(calls.at(-2)).toEqual(['PUT', '/variables-key', { key: 'k1' }]);
  expect([$('varLine').textContent, $('varLine').classList.contains('ok'), $('varState').hidden]).toEqual(['varIsSet', true, true]);
  expect([$('varForm').hidden, $('varActions').hidden]).toEqual([true, false]);
  // Replace key opens the field with Cancel; Cancel empties and closes it.
  click('varReplace');
  expect([$('varForm').hidden, $('varActions').hidden, $('varCancel').hidden]).toEqual([false, true, false]);
  typeIn('varKey', 'k2');
  click('varCancel');
  expect([$('varForm').hidden, $('varKey').value]).toEqual([true, '']);
  click('varRemove');
  expect(calls.at(-2)).toEqual(['PUT', '/variables-key', { key: '' }]);
  expect([$('varLine').textContent, $('varForm').hidden, $('varStatus').textContent]).toEqual(['varLineNone', false, 'varRemoved']);
});

it('Web dashboards: the line, the password form for a new one or the current one only, Diagnostics read once opened', () => {
  let password = true;
  const { calls, $, typeIn, click } = loadPage((method, path, body) => {
    if (path === '/web/password' && method === 'GET') return { set: password };
    if (path === '/web/password' && method === 'PUT') {
      if (body.current !== 'old-one!') return { ok: false, reason: 'wrong' };
      password = !!body.password; return { ok: true };
    }
    if (path === '/web/address') return { url: 'http://192.168.1.20/app/x/settings/dashboard.html' };
    if (path.startsWith('/diagnostics')) return { app: 'x', devices: [{ id: 'd1', name: 'Lamp' }] };
  }, { webDashboardsEnabled: true, webRemoteAccess: false });
  expect($('webLine').textContent).toBe('webLineHome · webLinePassword');
  expect(($('webOn').querySelector('.web-address') as HTMLElement).hidden).toBe(false);
  click('webRemote');
  expect($('webLine').textContent).toBe('webLineAway · webLinePassword');
  // Change password: the current one and a new one.
  expect([$('pwSet').textContent, $('pwRemove').hidden, $('pwState').hidden, $('pwForm').hidden]).toEqual(['webPasswordChange', false, false, true]);
  click('pwSet');
  expect([$('pwForm').hidden, $('pwActions').hidden, $('pwCurrentGroup').hidden, $('pwNewGroup').hidden, $('pwSave').textContent]).toEqual([false, true, false, false, 'webPasswordSave']);
  typeIn('webPassword', 'new-one!');
  expect($('pwSave').disabled).toBe(true);
  typeIn('pwCurrent', 'wrong');
  click('pwSave');
  expect($('pwStatus').textContent).toBe('webPasswordWrong');
  typeIn('pwCurrent', 'old-one!');
  click('pwSave');
  expect(calls.find(c => c[0] === 'PUT')).toEqual(['PUT', '/web/password', { password: 'new-one!', current: 'wrong' }]);
  expect(calls.filter(c => c[0] === 'PUT').at(-1)).toEqual(['PUT', '/web/password', { password: 'new-one!', current: 'old-one!' }]);
  expect([$('pwForm').hidden, $('pwStatus').textContent]).toEqual([true, 'webPasswordSaved']);
  // Remove password: the current one only.
  click('pwRemove');
  expect([$('pwCurrentGroup').hidden, $('pwNewGroup').hidden, $('pwSave').textContent]).toEqual([false, true, 'webPasswordRemove']);
  typeIn('pwCurrent', 'old-one!');
  click('pwSave');
  expect(calls.filter(c => c[0] === 'PUT').at(-1)).toEqual(['PUT', '/web/password', { password: '', current: 'old-one!' }]);
  expect([$('pwSet').textContent, $('pwRemove').hidden, $('pwState').hidden, $('webLine').textContent]).toEqual(['webPasswordSave', true, true, 'webLineAway']);
  // Turned off, the line says so.
  click('webEnabled');
  expect([$('webLine').textContent, $('webOn').hidden]).toEqual(['webLineOff', true]);
  // Diagnostics: not read until its card opens.
  expect(calls.some(c => c[1].startsWith('/diagnostics'))).toBe(false);
  const card = $('diagCard') as unknown as HTMLDetailsElement;
  card.open = true;
  card.dispatchEvent(new Event('toggle'));
  expect(calls.filter(c => c[1].startsWith('/diagnostics')).length).toBe(1);
  expect(($('device') as unknown as HTMLSelectElement).options.length).toBe(2);
});

it('Device names: the line, the separator only for its two choices, the examples; each change saved at once', () => {
  let stored = { mode: 'full', separator: '|' };
  const names = ['Bed | Bedroom', 'Ceiling lamp | Kitchen', 'Hall'];
  const answer = () => {
    const shown = names.map(name => [name, stored.mode === 'before' && name.includes(stored.separator) ? name.split(stored.separator)[0].trim() : name]);
    const changed = shown.filter(([name, s]) => name !== s).map(([name, s]) => ({ name, shown: s }));
    return { ...stored, examples: changed, changed: changed.length, total: names.length };
  };
  const { calls, $ } = loadPage((method, path, body) => {
    if (path !== '/device-names') return undefined;
    if (method === 'GET') return answer();
    if (body.separator === '') return { ok: false, reason: 'separator' };
    stored = { mode: body.mode, separator: body.separator ?? stored.separator };
    return { ok: true, ...answer() };
  });
  const select = $('namesMode') as unknown as HTMLSelectElement;
  const examples = () => [...document.querySelectorAll('#namesExamples li')].map(li => li.textContent);
  expect([$('namesLine').textContent, select.value, select.disabled, $('namesSepGroup').hidden, $('namesCount').hidden, examples()])
    .toEqual(['namesFull', 'full', false, true, true, []]);
  select.value = 'before';
  select.dispatchEvent(new Event('change'));
  expect(calls.at(-1)).toEqual(['PUT', '/device-names', { mode: 'before', separator: '|' }]);
  expect([$('namesLine').textContent, $('namesSepGroup').hidden, $('namesCount').textContent, examples()]).toEqual([
    'namesBeforeLine{"separator":"|"}', false, 'namesChanged{"changed":2,"total":3}',
    ['Bed | Bedroom → Bed', 'Ceiling lamp | Kitchen → Ceiling lamp'],
  ]);
  // A separator no name has: no examples, and the line says so.
  $('namesSep').value = ' - ';
  $('namesSep').dispatchEvent(new Event('change'));
  expect(calls.at(-1)).toEqual(['PUT', '/device-names', { mode: 'before', separator: ' - ' }]);
  expect([$('namesLine').textContent, $('namesCount').textContent, examples()]).toEqual(['namesBeforeLine{"separator":" - "}', 'namesNoneSep{"separator":" - "}', []]);
  // An emptied one isn't sent: the stored one comes back.
  const sent = calls.length;
  $('namesSep').value = '';
  $('namesSep').dispatchEvent(new Event('change'));
  expect([calls.length, $('namesSep').value, $('namesStatus').textContent]).toEqual([sent, ' - ', 'namesSepNeeded']);
  // Last word has no separator.
  select.value = 'lastWord';
  select.dispatchEvent(new Event('change'));
  expect(calls.at(-1)).toEqual(['PUT', '/device-names', { mode: 'lastWord', separator: ' - ' }]);
  expect([$('namesLine').textContent, $('namesSepGroup').hidden, $('namesStatus').textContent]).toEqual(['namesLastWord', true, '']);
});

it('Screens: adds one with a key, shows its code and address once, signs one in again and removes one', () => {
  let screens: any[] = [{ id: 's0', name: 'Hall', created: 1, used: 0, needsPassword: true }];
  const { calls, $, typeIn, click } = loadPage((method, path, body) => {
    if (path === '/web/password') return { set: true };
    if (path === '/web/address') return { url: 'http://192.168.1.20/app/x/settings/dashboard.html', remoteUrl: 'https://h.connect.athom.com/app/x/settings/dashboard.html' };
    if (path === '/web/screens' && method === 'GET') return { screens };
    if (path === '/web/screens' && method === 'POST') {
      if (body.current !== 'correct horse') return { ok: false, reason: 'wrong' };
      screens = [...screens, { id: 's1', name: body.name, created: 2, used: 0, needsPassword: false }];
      return { ok: true, id: 's1', code: 'ABCD-EFGH', devices: false, screens };
    }
    if (path === '/web/screens/s0' && method === 'PUT') { screens = screens.map(s => ({ ...s, needsPassword: false })); return { ok: true, screens }; }
    if (path.startsWith('/web/screens/') && method === 'DELETE') { screens = screens.filter(s => `/web/screens/${s.id}` !== path); return { ok: true, screens }; }
  }, { webDashboardsEnabled: true });
  return Promise.resolve().then(() => {
    expect(document.querySelector('#scrList li')!.textContent).toBe('HallwebScreenNeedsPasswordwebScreenSignInkpRemove');
    // Add screen: a name, the key and (a password is set) the current password.
    click('scrNew');
    expect([$('scrForm').hidden, $('scrCurrentGroup').hidden, $('scrSave').disabled]).toEqual([false, false, true]);
    typeIn('scrName', 'Kitchen');
    typeIn('scrKey', 'the-key');
    expect($('scrSave').disabled).toBe(true);
    typeIn('scrCurrent', 'nope');
    click('scrSave');
    expect($('scrStatus').textContent).toBe('webPasswordWrong');
    typeIn('scrCurrent', 'correct horse');
    click('scrSave');
    expect(calls.at(-1)).toEqual(['POST', '/web/screens', { name: 'Kitchen', key: 'the-key', current: 'correct horse' }]);
    expect([$('scrForm').hidden, $('scrShown').hidden, $('scrCode').textContent, $('scrNoDevices').hidden]).toEqual([true, false, 'ABCD-EFGH', false]);
    // The home address with the code (remote access is off, so not the away one).
    expect([...document.querySelectorAll('#scrAddresses .web-url')].map(n => n.textContent))
      .toEqual(['http://192.168.1.20/app/x/settings/dashboard.html#code=ABCD-EFGH']);
    expect(document.querySelectorAll('#scrList li')).toHaveLength(2);
    // Done takes the code off the page.
    click('scrDone');
    expect([$('scrShown').hidden, $('scrCode').textContent, $('scrActions').hidden]).toEqual([true, '', false]);
    // Sign in again: the current password only.
    (document.querySelectorAll('#scrList li')[0].querySelector('button') as HTMLButtonElement).click();
    expect([$('scrNameGroup').hidden, $('scrKeyGroup').hidden, $('scrSigning').textContent]).toEqual([true, true, 'webScreenSigning{"name":"Hall"}']);
    typeIn('scrCurrent', 'correct horse');
    click('scrSave');
    expect(calls.at(-1)).toEqual(['PUT', '/web/screens/s0', { current: 'correct horse' }]);
    expect($('scrStatus').textContent).toBe('webScreenSignedIn');
    // Remove: a second tap.
    const remove = () => document.querySelectorAll('#scrList li')[0].querySelector('button') as HTMLButtonElement;
    remove().click();
    expect(remove().textContent).toBe('kpRemoveAgain');
    remove().click();
    expect(calls.at(-1)).toEqual(['DELETE', '/web/screens/s0', null]);
    expect(document.querySelectorAll('#scrList li')).toHaveLength(1);
    expect($('scrStatus').textContent).toBe('webScreenRemoved');
  });
});
