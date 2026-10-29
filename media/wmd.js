// Marks previews of .w.md files and adds a media target selector.
// The preview fills in and morphs its content after load, so everything
// is re-applied whenever the DOM changes or a new document is shown.
(() => {
  const ID = 'wmd-media';
  const TARGETS = ['full', 'screen', 'flow', 'receipt'];

  let source = (() => {
    const meta = document.getElementById('vscode-markdown-preview-data');
    try { return JSON.parse(meta.getAttribute('data-settings')).source || ''; }
    catch { return ''; }
  })();

  const isWmd = () => /\.w\.md$/i.test(decodeURIComponent(source.split(/[?#]/)[0]));

  const setTarget = (target) => {
    for (const t of TARGETS) document.body.classList.toggle(`wmd-${t}`, t === target);
    sessionStorage.setItem(ID, target);
    document.querySelectorAll(`#${ID} li`).forEach((li) =>
      li.setAttribute('aria-checked', String(li.dataset.target === target)));
    const button = document.querySelector(`#${ID} > button`);
    if (button) button.title = `Media target: ${target}`;
  };

  // The W icon (the extension icon), inlined so the preview needs no extra resources.
  const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" viewBox="0 0 128 128"> <defs> <radialGradient id="wmd-bg" cx=".5" cy=".35" r=".8"> <stop offset="0" stop-color="#24103d"/> <stop offset="1" stop-color="#120320"/> </radialGradient> <linearGradient id="wmd-w" x1="0" y1="0" x2="0" y2="1"> <stop offset="0" stop-color="#a985d1"/> <stop offset="1" stop-color="#8f68b7"/> </linearGradient> </defs> <rect x="4" y="4" width="120" height="120" rx="26" fill="url(#wmd-bg)"/> <rect x="17" y="17" width="94" height="94" rx="16" fill="none" stroke="#df8218" stroke-width="3.5" stroke-dasharray="1 6.9212" stroke-linecap="round"/> <path d="M32 48 L46 94 L64 62 L82 94 L96 48" fill="none" stroke="url(#wmd-w)" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/> <circle cx="25.0" cy="25.0" r="11.25" fill="#8cd61f"/> <circle cx="103.0" cy="25.0" r="11.25" fill="#e5484d"/> </svg>';

  const selector = () => {
    let root = document.getElementById(ID);
    if (root) return root;
    root = document.createElement('div');
    root.id = ID;
    const button = document.createElement('button');
    button.innerHTML = LOGO;
    button.setAttribute('aria-label', 'Media target');
    button.setAttribute('aria-haspopup', 'menu');
    const menu = document.createElement('ul');
    menu.setAttribute('role', 'menu');
    for (const t of TARGETS) {
      const li = document.createElement('li');
      li.textContent = t;
      li.dataset.target = t;
      li.setAttribute('role', 'menuitemradio');
      li.addEventListener('click', () => { setTarget(t); root.classList.remove('open'); });
      menu.appendChild(li);
    }
    button.addEventListener('click', (e) => { e.stopPropagation(); root.classList.toggle('open'); });
    document.addEventListener('click', (e) => { if (!root.contains(e.target)) root.classList.remove('open'); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') root.classList.remove('open'); });
    root.append(button, menu);
    document.body.appendChild(root);
    return root;
  };

  const setText = (node, value) => { if (node.textContent !== value) node.textContent = value; };

  // Mirror each input[record] as "Record: value" text for flow and receipt.
  const fill = (input, text) => {
    setText(text.children[0], `${input.getAttribute('record')}: `);
    setText(text.children[1], input.value);
    const name = text.children[2];
    setText(name, input.name || '');
    const label = input.id && document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    const tip = label ? label.textContent.trim() : '';
    if (name.title !== tip) name.title = tip;
  };
  const records = () => {
    document.querySelectorAll('input[record]').forEach((input) => {
      let text = input.nextElementSibling;
      if (!text?.classList.contains('wmd-record')) {
        text = document.createElement('span');
        text.className = 'wmd-record';
        const name = document.createElement('span');
        name.className = 'wmd-name';
        const key = document.createElement('span');
        key.className = 'wmd-key';
        text.append(key, document.createElement('span'), name);
        input.after(text);
      }
      if (!input.dataset.wmdBound) {
        input.dataset.wmdBound = '1';
        input.addEventListener('input', () => fill(input, input.nextElementSibling));
      }
      fill(input, text);
    });
  };

  // A JSON Schema in compact form: {Azzurro: string*}, a star marks a required key.
  const compact = (s) => {
    if (!s || typeof s !== 'object') return 'any';
    for (const k of ['oneOf', 'anyOf']) if (Array.isArray(s[k])) return s[k].map(compact).join(' | ');
    if (Array.isArray(s.enum)) return s.enum.map((v) => JSON.stringify(v)).join(' | ');
    if (s.properties) {
      const req = new Set(s.required || []);
      return `{${Object.entries(s.properties).map(([k, v]) => `${k}: ${compact(v)}${req.has(k) ? '*' : ''}`).join(', ')}}`;
    }
    if (s.type === 'array') return `[${compact(s.items)}]`;
    return [].concat(s.type || 'any').join('|');
  };

  // Mirror each <schema> as a compact line right after it.
  const schemas = () => {
    document.querySelectorAll('schema').forEach((schema) => {
      const at = schema;
      let mirror = schema.wmdMirror;
      if (!mirror?.isConnected) {
        mirror = document.createElement('div');
        mirror.className = 'wmd-schema';
        schema.wmdMirror = mirror;
      }
      if (at.nextElementSibling !== mirror) at.after(mirror);
      let text, tip;
      try {
        const json = JSON.parse(schema.textContent);
        text = compact(json);
        tip = JSON.stringify(json, null, 2);
        mirror.classList.remove('wmd-bad');
      } catch (e) {
        text = 'invalid JSON schema';
        tip = e.message;
        mirror.classList.add('wmd-bad');
      }
      setText(mirror, text);
      if (mirror.title !== tip) mirror.title = tip;
    });
  };

  const apply = () => {
    const wmd = isWmd();
    document.body.classList.toggle('wmd', wmd);
    if (!wmd) { document.getElementById(ID)?.remove(); return; }
    if (!document.getElementById(ID)) {
      selector();
      const saved = sessionStorage.getItem(ID);
      setTarget(TARGETS.includes(saved) ? saved : 'full');
    }
    records();
    schemas();
  };

  let pending = false;
  const schedule = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; apply(); });
  };

  window.addEventListener('message', (e) => {
    if (e.data?.type === 'updateContent' && e.data.source) source = e.data.source;
    schedule();
  });
  window.addEventListener('vscode.markdown.updateContent', schedule);
  const start = () => {
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    apply();
  };
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', start);
  else start();
})();
