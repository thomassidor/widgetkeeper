/*
 * The web dashboards page — icons of the user's choice: the web dashboards' own name and icon, shown in the front page's
 * title, and a dashboard's optional icon. An icon is either the id of one of the icon settings' icons or a picture the
 * user uploaded, shrunk here and stored as a data URL (`iconOf()` in lib/WebDashboardService.ts). A part of the page
 * (settings/dashboard.js): mountWebDashboards() runs it once with `wd`. Plain browser JS (served as-is).
 */
(function () {
  'use strict';

  /** The largest a picture is kept at, then smaller until it fits `MAX_PICTURE`: at 48 px even a PNG always does. */
  const PICTURE_SIZES = [96, 64, 48];
  const MAX_PICTURE = 16000; // MAX_ICON_PICTURE in lib/WebDashboardService.ts
  const SVG_NS = 'http://www.w3.org/2000/svg';

  window.WidgetkeeperWeb.part('icons', (wd) => {
    const { button, el, icon, request, t } = wd;
    const KIT_ICONS = window.WidgetkeeperKit.icons;

    const isIconPicture = (value) => typeof value === 'string' && value.startsWith('data:image/');
    const knownIcon = (value) => typeof value === 'string' && Object.prototype.hasOwnProperty.call(KIT_ICONS, value);

    /** A chosen icon, `span.wd-chosen-icon` with a picture or the glyph in the text's colour; null for none or one no longer known. */
    function iconNode(value) {
      if (!isIconPicture(value) && !knownIcon(value)) return null;
      const node = el('span', 'wd-chosen-icon');
      if (isIconPicture(value)) {
        const img = el('img');
        img.src = value;
        img.alt = '';
        node.append(img);
      } else {
        node.append(glyph(KIT_ICONS[value]));
      }
      return node;
    }

    function glyph(def) {
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', def.d);
      if (def.fill) path.setAttribute('class', 'filled');
      svg.append(path);
      return svg;
    }

    const favicon = document.querySelector('link[rel="icon"]');
    const defaultFavicon = favicon && favicon.getAttribute('href');

    /** The browser's tab icon: a picture as it is, a glyph white on the brand colour as the app's own, nothing chosen the app's. */
    function setFavicon(value) {
      if (!favicon) return;
      let href = defaultFavicon;
      if (isIconPicture(value)) {
        href = value;
      } else if (knownIcon(value)) {
        const { d, fill } = KIT_ICONS[value];
        const paint = fill ? 'fill="#fff"' : 'fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
        href = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="${SVG_NS}" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#2A1958"/><path transform="translate(4 4)" d="${d}" ${paint}/></svg>`)}`;
      }
      if (favicon.getAttribute('href') !== href) favicon.setAttribute('href', href);
    }

    /** A file as an icon: a small WebP (a PNG where the browser can't write WebP) data URL. Rejects what isn't a picture. */
    async function pictureIcon(file) {
      const url = URL.createObjectURL(file);
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const width = image.naturalWidth || PICTURE_SIZES[0]; // an SVG needn't have a size
        const height = image.naturalHeight || PICTURE_SIZES[0];
        for (const size of PICTURE_SIZES) {
          const scale = Math.min(1, size / Math.max(width, height));
          const canvas = /** @type {HTMLCanvasElement} */ (el('canvas'));
          canvas.width = Math.max(1, Math.round(width * scale));
          canvas.height = Math.max(1, Math.round(height * scale));
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
          const data = canvas.toDataURL('image/webp', 0.85);
          if (data.length <= MAX_PICTURE) return data;
        }
        throw new Error('Too large');
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    let names = null;
    /** The icons with their names in Homey's language, read once; without them, by id, so the picker still works. */
    async function iconNames() {
      if (!names) {
        try {
          names = (await request('GET', '/web/icons')).filter(x => knownIcon(x.id));
        } catch (e) {
          return Object.keys(KIT_ICONS).map(id => ({ id, name: id }));
        }
      }
      return names;
    }

    /**
     * The picker, a dialog: no icon (`noneLabel`), a picture of the user's own, a search and the icons. `picked(value)`
     * gets the id or data URL, or null for none.
     */
    function pickIcon({ value, noneLabel, picked }) {
      const { d, body } = wd.dialog(t('iconChoose'));
      d.classList.add('wd-iconpick-dialog');
      const choose = (v) => { d.close(); picked(v); };

      const none = button('wd-btn', noneLabel, () => choose(null));
      if (!value) none.setAttribute('aria-current', 'true');
      const file = /** @type {HTMLInputElement} */ (el('input'));
      file.type = 'file';
      file.accept = 'image/*';
      file.hidden = true;
      const status = el('p', 'wd-hint');
      status.setAttribute('role', 'status');
      status.hidden = true;
      const upload = button('wd-btn', '', () => file.click());
      upload.append(icon('image'), el('span', null, t('iconUpload')));
      file.addEventListener('change', async () => {
        if (!file.files || !file.files[0]) return;
        upload.disabled = true;
        status.textContent = '';
        status.hidden = true;
        try {
          choose(await pictureIcon(file.files[0]));
        } catch (e) {
          status.textContent = t('iconBad');
          status.hidden = false;
          upload.disabled = false;
          file.value = '';
        }
      });
      const head = el('div', 'wd-row');
      head.append(none, upload, file);

      const search = /** @type {HTMLInputElement} */ (el('input', 'wd-input'));
      search.type = 'search';
      search.placeholder = t('search');
      search.setAttribute('aria-label', t('search'));
      const grid = el('div', 'wd-iconpick');
      let all = [];
      const draw = () => {
        const shown = all.filter(x => wd.matchesWords(search.value, `${x.name} ${x.id}`));
        if (!shown.length) { grid.replaceChildren(el('p', 'wd-muted', t('nothingFound'))); return; }
        grid.replaceChildren(...shown.map((x) => {
          const b = button('wd-iconpick-item', '', () => choose(x.id), x.name);
          b.title = x.name;
          if (x.id === value) b.setAttribute('aria-current', 'true');
          b.append(glyph(KIT_ICONS[x.id]));
          return b;
        }));
      };
      search.addEventListener('input', draw);
      body.append(head, status, search, grid);
      d.showModal();
      iconNames().then((list) => { all = list; if (d.open) draw(); });
    }

    /** The front page Settings' first section: the web dashboards' own name and icon, the same on every browser. */
    function brandSection(setRow) {
      const setBrand = (key, value) => {
        const brand = { ...(wd.frontPage.brand || {}) };
        if (value) brand[key] = value;
        else delete brand[key];
        wd.frontPage = { ...wd.frontPage };
        if (brand.name || brand.icon) wd.frontPage.brand = brand;
        else delete wd.frontPage.brand;
        wd.saveFront({ brand });
        wd.brandChanged();
      };
      const name = /** @type {HTMLInputElement} */ (el('input', 'wd-input wd-brand-field'));
      name.id = 'wd-brand-name';
      name.type = 'text';
      name.maxLength = 60;
      name.value = (wd.frontPage.brand && wd.frontPage.brand.name) || '';
      name.placeholder = `Widgetkeeper ${t('title')}`;
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });
      name.addEventListener('change', () => {
        name.value = name.value.trim();
        setBrand('name', name.value);
      });
      const pick = button('wd-btn wd-dashicon-pick', '', () => pickIcon({
        value: wd.frontPage.brand && wd.frontPage.brand.icon,
        noneLabel: t('iconDefault'),
        picked(value) { setBrand('icon', value); drawPick(); },
      }), t('iconChoose'));
      const drawPick = () => pick.replaceChildren(iconNode(wd.frontPage.brand && wd.frontPage.brand.icon) || icon('image'));
      drawPick();
      const card = el('div', 'wd-set-card');
      card.append(setRow(t('name'), t('brandNameText'), name, name.id), setRow(t('brandIcon'), t('brandIconText'), pick));
      const section = el('section', 'wd-page-section');
      section.append(el('h3', 'wd-h2', t('brandTitle')), card);
      return section;
    }

    Object.assign(wd, { brandSection, iconNode, isIconPicture, pickIcon, pictureIcon, setFavicon });
  });
})();
