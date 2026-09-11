window.__qa = {
  frameDoc() { const f = document.querySelector('iframe[name="editor-canvas"]'); return f ? f.contentDocument : document; },
  sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
  async insert(name, attrs) {
    const b = wp.blocks.createBlock(name, attrs || {});
    await wp.data.dispatch('core/block-editor').insertBlocks(b);
    await this.sleep(300);
    return b.clientId;
  },
  editable(clientId) {
    const doc = this.frameDoc();
    const el = doc.querySelector('[data-block="' + clientId + '"]');
    if (!el) return null;
    return el.matches('[contenteditable="true"]') ? el : el.querySelector('[contenteditable="true"]');
  },
  blockEl(id) { const doc = this.frameDoc(); const root = doc.querySelector('[data-block="' + id + '"]'); return root.querySelector('.typost-block-content') || root.querySelector('[contenteditable]') || root; },
  selectText(clientId, start, end) {
    const doc = this.frameDoc();
    const ed = this.editable(clientId);
    wp.data.dispatch('core/block-editor').selectBlock(clientId);
    const walker = doc.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
    let pos = 0, sNode, sOff, eNode, eOff, n;
    while ((n = walker.nextNode())) {
      const len = n.textContent.length;
      if (sNode === undefined && start <= pos + len) { sNode = n; sOff = start - pos; }
      if (eNode === undefined && end <= pos + len) { eNode = n; eOff = end - pos; break; }
      pos += len;
    }
    const range = doc.createRange(); range.setStart(sNode, sOff); range.setEnd(eNode, eOff);
    const sel = doc.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    ed.focus();
    doc.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    return { text: range.toString() };
  },
  async selectTextVerified(clientId, start, end) {
    const d = wp.data.dispatch('core/block-editor');
    d.clearSelectedBlock();
    await this.sleep(150);
    this.selectText(clientId, start, end);
    await this.sleep(400);
    // The store must report this block with these offsets — matching
    // offsets in a different block would pass every downstream assertion
    // against the wrong text.
    const matches = (sel) => !!(sel.start && sel.end
      && sel.start.clientId === clientId && sel.end.clientId === clientId
      && sel.start.offset === start && sel.end.offset === end);
    let st = this.storeSel();
    if (!matches(st)) {
      d.selectionChange(clientId, 'content', start, end);
      await this.sleep(200);
      st = this.storeSel();
    }
    return { ok: matches(st), store: st };
  },
  html(clientId) { return wp.blocks.serialize(wp.data.select('core/block-editor').getBlock(clientId)); },
  storeSel() { const s = wp.data.select('core/block-editor'); return { start: s.getSelectionStart(), end: s.getSelectionEnd() }; },
  computed(el) { const c = getComputedStyle(el); return { font: c.fontFamily, size: c.fontSize, weight: c.fontWeight, style: c.fontStyle, ffs: c.fontFeatureSettings, ls: c.letterSpacing }; },
  fontName(id) { const d = window.typostData; const all = [].concat(d.fonts || [], d.adobeFonts || [], d.manualFonts || [], d.adoptedWpFonts || []); const f = all.find(x => String(x.font_id) === String(id)); return f ? (f.name || f.kit_name || f.font_family) : null; },
  live() { return Array.from(document.querySelectorAll('[aria-live]')).map(e => e.textContent.trim()).filter(Boolean); }
};
