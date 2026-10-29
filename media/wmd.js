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

  const selector = () => {
    let root = document.getElementById(ID);
    if (root) return root;
    root = document.createElement('div');
    root.id = ID;
    const button = document.createElement('button');
    button.textContent = 'W';
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
