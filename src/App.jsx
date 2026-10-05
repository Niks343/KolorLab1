import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDown, ArrowDownUp, ArrowRight, Building2, Camera, Check, ChevronDown, Copy, Droplets, FileDown, FileUp,
  Expand, GitCompareArrows, Image as ImageIcon, Layers3, Lightbulb, Paintbrush, Plus, Printer,
  Search, ShieldCheck, ShoppingBag, SlidersHorizontal, Trash2, UserRound,
  Users, X,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import baseColors from './data/colors.json';
import farrowBallColors from './data/farrowBall.js';
import { estimateLrvFromHex, getTintingBase } from './data/colorBase.js';
import { apiBaseUrl, apiRequest } from './data/apiClient.js';
import { deltaEFromLab, filterColors, getClosestColorMatches, getColorFamily, getColorRecommendations, rgbToLab } from './data/colorTools.js';
import {
  createCustomCatalogDocument,
  mergeCustomCatalog,
  normalizeCustomColor,
  normalizeCustomPaintProduct,
  parseCustomCatalogDocument,
} from './data/userCatalog.js';
import paintProducts from './data/paintProducts.js';
import smoothWallImage from './assets/surfaces/smooth-wall.jpg';
import wallpaperImage from './assets/surfaces/paintable-wallpaper.jpg';
import plasterImage from './assets/surfaces/plaster.jpg';
import kolorlabLogo from './assets/kolorlab-logo.png';
import CatalogManagementDialog from './components/CatalogManagementDialog.jsx';
import PaintCatalogPanel from './components/PaintCatalogPanel.jsx';
import { getPaintProductMetadata, paintApplications, paintCategories, paintMaterials } from './data/paintCatalog.js';

const colors = [
  ...baseColors.map((color) => {
    const lrvEstimated = !Number.isFinite(color.lrv);
    const lrv = lrvEstimated ? estimateLrvFromHex(color.hex) : color.lrv;
    return {
      ...color,
      lrv,
      lrvEstimated,
      base: getTintingBase(color.hex, lrv, color.baseOverride),
    };
  }),
  ...farrowBallColors,
];
const workspaceStorageKey = 'kolorlab.workspace.v1';
const defaultProjectName = 'Общий проект';

function sharedProjectsSnapshot(projects, projectNames, clientId) {
  return JSON.stringify({
    projects: projects.filter((project) => project.clientId === clientId)
      .map((project) => {
        const color = project.color;
        const sharedColor = {
          id: color.id.slice(0, 200),
          code: color.code.slice(0, 40),
          name_ru: color.name_ru.slice(0, 80),
          catalog: typeof color.catalog === 'string' ? color.catalog.slice(0, 80) : '',
          hex: color.hex.toUpperCase(),
          base: color.base === 'A' || color.base === 'C' ? color.base : null,
          ...(Array.isArray(color.rgb) ? { rgb: color.rgb.slice(0, 3) } : {}),
          ...(Number.isFinite(color.lrv) ? { lrv: color.lrv } : {}),
          ...(Array.isArray(color.applications) ? { applications: color.applications.filter((item) => typeof item === 'string').slice(0, 10) } : {}),
        };
        const quantity = project.quantity ?? project.liters;
        const paintProductFields = [
          'id', 'brand', 'name', 'finish', 'purpose', 'coverageBySurface', 'coverageDescription',
          'baseSystem', 'baseSystemByTintBase', 'packageSizesLiters', 'packageSizesKg', 'quantityUnit',
          'tintBases', 'paintCategory', 'applications', 'tintable', 'compatibleMaterials',
          'availabilityNote', 'pricePerUnit', 'pricePerLiter', 'source', 'custom',
        ];
        const paintProduct = project.paintProduct && typeof project.paintProduct === 'object'
          ? Object.fromEntries(paintProductFields
            .filter((key) => key in project.paintProduct)
            .map((key) => [key, project.paintProduct[key]]))
          : null;
        return {
          key: project.key,
          clientId,
          projectName: project.projectName.trim(),
          color: sharedColor,
          base: sharedColor.base,
          zone: typeof project.zone === 'string' ? project.zone.slice(0, 80) : 'Гостиная',
          area: Number.isFinite(project.area) ? project.area : null,
          layers: Number.isFinite(project.layers) ? project.layers : null,
          surface: typeof project.surface === 'string' ? project.surface.slice(0, 40) : 'wall',
          liters: quantity,
          quantity,
          quantityUnit: project.quantityUnit === 'kg' ? 'kg' : 'л',
          cans: typeof project.cans === 'string' ? project.cans.slice(0, 300) : '',
          paintProduct,
        };
      }),
    projectNames: [...new Set([...(projectNames ?? []), defaultProjectName])],
  });
}
const customColorsCatalog = 'Мои цвета';
const surfacesCatalogIds = new Set(['wall', 'plaster', 'bath', 'facade']);
const catalogLabels = {
  'RAL Classic': 'RAL',
  'Tikkurila Symphony': 'Tikkurila',
};

function getCatalogLabel(catalog) {
  return catalogLabels[catalog] ?? catalog.replace(' 3D-System Plus', '');
}

const surfaces = [
  { id: 'wall', label: 'Гладкая стена', rate: 10, icon: Layers3 },
  { id: 'plaster', label: 'Штукатурка', rate: 8, icon: SlidersHorizontal },
  { id: 'bath', label: 'Интерьер комнаты', rate: 10, icon: Droplets },
  { id: 'facade', label: 'Фасад', rate: 7, icon: Building2 },
];
const visualSurfaces = [
  { id: 'wall', label: 'Гладкая стена', icon: Layers3, image: smoothWallImage, calculatorSurface: 'wall' },
  { id: 'wallpaper', label: 'Обои под покраску', icon: ImageIcon, image: wallpaperImage, calculatorSurface: 'wall' },
  { id: 'plaster', label: 'Штукатурка', icon: SlidersHorizontal, image: plasterImage, calculatorSurface: 'plaster' },
];
const temperatures = [
  { value: 2700, title: 'Тёплый уютный свет', className: 'light-warm', swatch: '#d99447' },
  { value: 4000, title: 'Нейтральный дневной', className: 'light-neutral', swatch: '#d9dfd4' },
  { value: 6500, title: 'Холодный свет', className: 'light-cool', swatch: '#7db9f3' },
];
const zones = ['Гостиная', 'Фасад', 'Спальня', 'Кухня', 'Санузел', 'Детская'];
const catalogFilters = [
  { label: 'Все', catalog: null },
  { label: customColorsCatalog, catalog: customColorsCatalog },
  { label: 'RAL', catalog: 'RAL Classic' },
  { label: 'NCS', catalog: 'NCS' },
  { label: 'Tikkurila', catalog: 'Tikkurila Symphony' },
  { label: 'DUFA', catalog: 'Dufa Color Experience' },
  { label: 'Dulux', catalog: 'Dulux' },
  { label: 'Caparol', catalog: 'Caparol 3D-System Plus' },
  { label: 'Benjamin Moore', catalog: 'Benjamin Moore' },
  { label: 'Farrow & Ball', catalog: 'Farrow & Ball' },
  { label: 'Little Greene', catalog: 'Little Greene' },
];
const applicationFilters = [
  { id: 'all', label: 'Любое применение' },
  { id: 'интерьер', label: 'Интерьер' },
  { id: 'фасад', label: 'Фасад' },
];
const colorFamilies = ['Все семейства', 'Нейтральные', 'Красные', 'Оранжевые', 'Жёлтые', 'Зелёные', 'Бирюзовые', 'Голубые', 'Синие', 'Фиолетовые', 'Пурпурные'];
const lightnessFilters = ['Любая светлота', 'Светлые', 'Средние', 'Тёмные'];
const showcaseSwatches = [
  { code: 'RAL 1013', name: 'Устричный белый', hex: '#EAE6D7' },
  { code: 'RAL 5003', name: 'Сапфирово-синий', hex: '#1F3855' },
  { code: 'RAL 3011', name: 'Коричнево-красный', hex: '#781F19' },
  { code: 'NCS S 0502-Y', name: 'Тёплый белый', hex: '#F5F2EB' },
  { code: 'HC-154', name: 'Хейл Нэви', hex: '#2C3843' },
  { code: 'No. 229', name: 'Дыхание слона', hex: '#C6BEB5' },
];

function getCatalogAlternatives(sourceColor, availableColors = colors) {
  const source = availableColors.find((color) => color.id === sourceColor.id);
  if (!source) return [];
  const sourceLab = rgbToLab(source.rgb);
  const candidates = availableColors
    .filter((color) => color.catalog !== sourceColor.catalog)
    .map((color) => ({ color, distance: deltaEFromLab(sourceLab, rgbToLab(color.rgb)) }))
    .sort((a, b) => a.distance - b.distance);
  const seenCatalogs = new Set();
  return candidates.filter(({ color }) => {
    if (seenCatalogs.has(color.catalog)) return false;
    seenCatalogs.add(color.catalog);
    return true;
  }).slice(0, 4);
}

function similarityPercent(distance) {
  return Math.max(0, Math.round(100 - distance / 1.5));
}

function optimizeCans(liters, base) {
  const needed = Math.ceil(liters * 10);
  const maxBuckets = Math.ceil(needed / 90);
  let best = null;
  for (let buckets = 0; buckets <= maxBuckets; buckets += 1) {
    for (let medium = 0; medium <= Math.ceil(needed / 27) + 1; medium += 1) {
      const remainder = Math.max(0, needed - buckets * 90 - medium * 27);
      const small = Math.ceil(remainder / 9);
      const total = buckets * 90 + medium * 27 + small * 9;
      const cans = buckets + medium + small;
      if (!best || total < best.total || (total === best.total && cans < best.cans)) {
        best = { buckets, medium, small, total, cans };
      }
    }
  }
  return [
    best.buckets && `${best.buckets} × 9 л (База ${base})`,
    best.medium && `${best.medium} × 2,7 л (База ${base})`,
    best.small && `${best.small} × 0,9 л (База ${base})`,
  ].filter(Boolean).join(' + ');
}

function optimizeProductPackages(liters, packageSizes, tintBase = '', unitLabel = 'л') {
  const unit = 10;
  const needed = Math.ceil(liters * unit);
  const packages = packageSizes.map((size) => Math.round(size * unit));
  const limit = needed + Math.max(...packages);
  const counts = new Array(limit + 1).fill(Number.POSITIVE_INFINITY);
  const previous = new Array(limit + 1).fill(-1);
  counts[0] = 0;

  for (let amount = 1; amount <= limit; amount += 1) {
    for (let index = 0; index < packages.length; index += 1) {
      const packageSize = packages[index];
      if (amount >= packageSize && counts[amount - packageSize] + 1 < counts[amount]) {
        counts[amount] = counts[amount - packageSize] + 1;
        previous[amount] = index;
      }
    }
  }

  let purchased = needed;
  while (purchased <= limit && !Number.isFinite(counts[purchased])) purchased += 1;
  const packageCounts = new Array(packages.length).fill(0);
  while (purchased > 0) {
    const index = previous[purchased];
    packageCounts[index] += 1;
    purchased -= packages[index];
  }

  return packageCounts
    .map((count, index) => count && `${count} × ${packageSizes[index].toLocaleString('ru-RU')} ${unitLabel}${tintBase ? ` (База ${tintBase})` : ''}`)
    .filter(Boolean)
    .join(' + ');
}

function getProductPackageSizes(product, tintBase) {
  if (product.quantityUnit === 'kg') return product.packageSizesKg ?? null;
  return product.packageSizesByTintBase?.[tintBase] ?? product.packageSizesLiters ?? null;
}

function BaseBadge({ base }) {
  if (!base) {
    return <span className="inline-flex items-center rounded-full bg-slate-400/10 px-2 py-1 text-[10px] font-bold text-slate-300">Без колеровочной базы</span>;
  }
  const isWhite = base === 'A';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${isWhite ? 'bg-sky-400/10 text-sky-300' : 'bg-amber-400/10 base-warning'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${isWhite ? 'bg-sky-300' : 'bg-[var(--warning-500)]'}`} />
      База {base}
    </span>
  );
}

function getArchivedWoodProjectColor(id) {
  if (!id.startsWith('valtti-') && !id.startsWith('osmo-decking-')) return null;
  return {
    id,
    code: id,
    name_ru: 'Оттенок дерева удалён из каталога',
    name_en: 'Archived wood finish',
    catalog: 'Архивный проект',
    hex: '#5a5148',
    rgb: [90, 81, 72],
    lrv: 9,
    base: null,
    applications: [],
  };
}

function readWorkspace() {
  try {
    const stored = window.localStorage.getItem(workspaceStorageKey);
    if (!stored) return {
      clients: [],
      projects: [],
      customColors: [],
      customPaintProducts: [],
      deletedCatalogIds: [],
      activeClientId: '',
      activePaintProductId: '',
      paintPricesByProduct: {},
      activeProjectName: defaultProjectName,
      projectNamesByClient: {},
      selectedId: colors[0].id,
      comparisonIds: [],
      previewSurface: 'wall',
      temperature: 4000,
      area: 32,
      layers: 2,
      zone: 'Гостиная',
      error: false,
    };
    const parsed = JSON.parse(stored);
    if (![1, 2].includes(parsed.version) || !Array.isArray(parsed.clients) || !Array.isArray(parsed.projects)) {
      throw new Error('Unsupported or invalid saved workspace format');
    }

    const customColors = Array.isArray(parsed.customColors)
      ? parsed.customColors.map(normalizeCustomColor).filter(Boolean)
      : [];
    const customPaintProducts = Array.isArray(parsed.customPaintProducts)
      ? parsed.customPaintProducts.map(normalizeCustomPaintProduct).filter(Boolean)
      : [];
    const deletedCatalogIds = Array.isArray(parsed.deletedCatalogIds)
      ? [...new Set(parsed.deletedCatalogIds.filter((id) => typeof id === 'string'))]
      : [];
    const deletedIdSet = new Set(deletedCatalogIds);
    const availablePaintProductsById = new Map([
      ...paintProducts.filter((product) => !deletedIdSet.has(product.id)),
      ...customPaintProducts.filter((product) => !deletedIdSet.has(product.id)),
    ].map((product) => [product.id, product]));
    const availableColorsById = new Map([
      ...colors.filter((color) => !deletedIdSet.has(color.id)),
      ...customColors.filter((color) => !deletedIdSet.has(color.id)),
    ].map((color) => [color.id, color]));
    const clients = parsed.clients
      .filter((client) => client && typeof client.id === 'string' && typeof client.name === 'string')
      .map((client) => ({
        id: client.id,
        name: client.name,
        phoneLast4: String(client.phoneLast4 ?? '').replace(/\D/g, '').slice(-4),
        hasPin: client.hasPin === true,
        remote: client.remote === true,
      }));
    const clientIds = new Set(clients.map((client) => client.id));
    const projects = parsed.projects.flatMap((item) => {
      if (!item || typeof item.key !== 'string' || !clientIds.has(item.clientId)) return [];
      const colorId = item.color?.id;
      const color = typeof colorId === 'string'
        ? availableColorsById.get(colorId) ?? normalizeCustomColor(item.color) ?? getArchivedWoodProjectColor(colorId)
        : null;
      if (!color) return [];
      const surfaceId = surfaces.some((surfaceItem) => surfaceItem.id === item.surface) ? item.surface : 'wall';
      const savedPaintProduct = typeof item.paintProduct?.id === 'string'
        ? availablePaintProductsById.get(item.paintProduct.id) ?? normalizeCustomPaintProduct(item.paintProduct)
        : null;
      return [{
        key: item.key,
        clientId: item.clientId,
        projectName: typeof item.projectName === 'string' && item.projectName.trim() ? item.projectName : defaultProjectName,
        clientName: clients.find((client) => client.id === item.clientId)?.name ?? '',
        clientPhoneLast4: clients.find((client) => client.id === item.clientId)?.phoneLast4 ?? '',
        color,
        base: color.base,
        zone: zones.includes(item.zone) ? item.zone : 'Гостиная',
        liters: Number.isFinite(item.quantity) ? item.quantity : Number.isFinite(item.liters) ? item.liters : 0,
        quantityUnit: item.quantityUnit === 'kg' ? 'kg' : 'л',
        cans: typeof item.cans === 'string' ? item.cans : '',
        paintProduct: savedPaintProduct
          ? { ...savedPaintProduct, pricePerUnit: Number.isFinite(item.paintProduct.pricePerUnit) ? item.paintProduct.pricePerUnit : Number.isFinite(item.paintProduct.pricePerLiter) ? item.paintProduct.pricePerLiter : null }
          : null,
        area: Number.isFinite(item.area) ? item.area : null,
        layers: Number.isFinite(item.layers) ? item.layers : null,
        surface: surfaceId,
      }];
    });
    const paintPricesByProduct = Object.fromEntries(
      Object.entries(parsed.paintPricesByProduct ?? {})
        .filter(([id, price]) => availablePaintProductsById.has(id) && Number.isFinite(price) && price >= 0),
    );
    const activeClientId = clientIds.has(parsed.activeClientId) ? parsed.activeClientId : '';
    const activePaintProductId = availablePaintProductsById.has(parsed.activePaintProductId) ? parsed.activePaintProductId : '';
    const legacyProjectNames = Array.isArray(parsed.projectNames)
      ? parsed.projectNames.filter((name) => typeof name === 'string' && name.trim()).map((name) => name.trim())
      : [];
    const projectNamesByClient = Object.fromEntries(clients.map((client) => {
      const savedNames = parsed.projectNamesByClient?.[client.id];
      return [client.id, [...new Set([
        ...(Array.isArray(savedNames) ? savedNames.filter((name) => typeof name === 'string' && name.trim()).map((name) => name.trim()) : []),
        ...(!parsed.projectNamesByClient && client.id === activeClientId ? legacyProjectNames : []),
        ...projects.filter((project) => project.clientId === client.id).map((project) => project.projectName),
        defaultProjectName,
      ])]];
    }));
    const currentProjectNames = projectNamesByClient[activeClientId] ?? [defaultProjectName];
    const activeProjectName = currentProjectNames.includes(parsed.activeProjectName) ? parsed.activeProjectName : currentProjectNames[0];
    const selectedId = availableColorsById.has(parsed.selectedColorId)
      ? parsed.selectedColorId
      : availableColorsById.keys().next().value ?? colors[0].id;
    const comparisonIds = Array.isArray(parsed.comparisonIds)
      ? [...new Set(parsed.comparisonIds.filter((id) => availableColorsById.has(id)))].slice(0, 6)
      : [];
    const previewSurface = visualSurfaces.some(({ id }) => id === parsed.previewSurface) ? parsed.previewSurface : 'wall';
    const temperature = temperatures.some(({ value }) => value === parsed.temperature) ? parsed.temperature : 4000;
    const area = Number.isFinite(parsed.area) ? Math.max(5, Math.min(150, parsed.area)) : 32;
    const layers = [1, 2, 3].includes(parsed.layers) ? parsed.layers : 2;
    const zone = zones.includes(parsed.zone) ? parsed.zone : 'Гостиная';
    return { clients, projects, customColors, customPaintProducts, deletedCatalogIds, activeClientId, activePaintProductId, paintPricesByProduct, activeProjectName, projectNamesByClient, selectedId, comparisonIds, previewSurface, temperature, area, layers, zone, error: false };
  } catch (error) {
    console.error('Не удалось загрузить локальные данные KolorLab.', error);
    return { clients: [], projects: [], customColors: [], customPaintProducts: [], deletedCatalogIds: [], activeClientId: '', activePaintProductId: '', paintPricesByProduct: {}, activeProjectName: defaultProjectName, projectNamesByClient: {}, selectedId: colors[0].id, comparisonIds: [], previewSurface: 'wall', temperature: 4000, area: 32, layers: 2, zone: 'Гостиная', error: true };
  }
}

function ProductPhotographyMockup() {
  return (
    <section className="product-photo-stage" aria-label="Планшет с приложением KolorLab на рабочем столе">
      <div className="photo-blueprint" aria-hidden="true">
        <svg viewBox="0 0 360 230" fill="none">
          <path d="M16 20h142v82H16zM158 20h102v82H158M16 102v98h89v-98m53 0v98h102v-98M105 102h53m-89-82v82m89-53h102M49 102v98m109-58h102M158 155h102" />
          <path d="M27 31h120v60H27zM169 31h80v60h-80M116 114v74m53-25h80" />
          <circle cx="131" cy="66" r="3" /><circle cx="207" cy="137" r="3" />
          <path d="M16 12v-7m142 7v-7M8 20H1m7 82H1m267-82h7m-7 82h7" />
          <path d="M16 8h142m-4 0 4 4m-8-4-4 4M5 20v82m0-4 4 4m-4-8 4-4" />
        </svg>
      </div>
      <div className="photo-tape" aria-hidden="true"><span>3м</span></div>
      <div className="photo-ruler" aria-hidden="true"><span>0</span><span>10</span><span>20</span><span>30</span><span>40</span><span>50</span></div>
      <div className="photo-caption">
        <span className="photo-caption-dot" />
        ЦВЕТ НАСТРОЕНИЯ. ТОЧНОСТЬ РАСЧЁТА.
      </div>
      <div className="product-tablet">
        <div className="tablet-camera" />
        <div className="tablet-screen">
          <div className="mockup-topbar">
            <div className="mockup-brand"><span className="mockup-logo">K</span><span>kolor<span>lab</span></span></div>
            <span className="mockup-project-label">ПРОЕКТ · ГОСТИНАЯ</span>
            <span className="mockup-status"><span /> Проект сохранён</span>
          </div>
          <div className="mockup-workspace">
            <div className="mockup-project">
              <div className="mockup-section-heading"><span>Предпросмотр проекта</span><span className="mockup-light-label">2700K · Тёплый</span></div>
              <div className="mockup-living-room">
                <div className="mockup-window"><span /><span /></div>
                <div className="mockup-art"><span /></div>
                <div className="mockup-plant"><i /><i /><i /><b /></div>
                <div className="mockup-sofa"><i /><b /></div>
                <div className="mockup-table"><i /></div>
                <div className="mockup-rug" />
              </div>
              <div className="mockup-calculation">
                <div><span className="mockup-micro-label">РАСЧЁТ КРАСКИ</span><b>16,5 <small>литров</small></b><span className="mockup-paint-code">NCS S 2005-Y50R · База A</span></div>
                <div className="mockup-paint-can"><i /><b>BASE<br />X</b><span /></div>
              </div>
            </div>
            <div className="mockup-library">
              <div className="mockup-section-heading"><span>Библиотека цветов</span><span className="mockup-library-count">132</span></div>
              <div className="mockup-search"><Search size={10} /><span>Поиск по каталогу и коду...</span></div>
              <div className="mockup-swatch-grid">
                {showcaseSwatches.map((swatch) => <div className="mockup-swatch" key={swatch.code}>
                  <span style={{ backgroundColor: swatch.hex }} />
                  <b>{swatch.code}</b>
                  <small>{swatch.name}</small>
                </div>)}
              </div>
              <div className="mockup-library-footer"><span>RAL · NCS · TIKKURILA</span><span>Все каталоги <ArrowRight size={9} /></span></div>
            </div>
          </div>
          <div className="mockup-home-indicator" />
        </div>
      </div>
    </section>
  );
}

function App() {
  const [initialWorkspace] = useState(readWorkspace);
  const [customColors, setCustomColors] = useState(initialWorkspace.customColors);
  const [customPaintProducts, setCustomPaintProducts] = useState(initialWorkspace.customPaintProducts);
  const [deletedCatalogIds, setDeletedCatalogIds] = useState(() => new Set(initialWorkspace.deletedCatalogIds));
  const [welcomeOpen, setWelcomeOpen] = useState(true);
  const [selectedId, setSelectedId] = useState(initialWorkspace.selectedId);
  const [catalog, setCatalog] = useState(null);
  const [baseFilter, setBaseFilter] = useState('Все базы');
  const [applicationFilter, setApplicationFilter] = useState('all');
  const [familyFilter, setFamilyFilter] = useState('Все семейства');
  const [lightnessFilter, setLightnessFilter] = useState('Любая светлота');
  const [search, setSearch] = useState('');
  const [surface, setSurface] = useState(() => {
    const product = [...paintProducts, ...initialWorkspace.customPaintProducts]
      .find((item) => item.id === initialWorkspace.activePaintProductId);
    return product && !product.surfaces.includes('wall') ? product.surfaces[0] : 'wall';
  });
  const [previewSurface, setPreviewSurface] = useState(() => {
    if (initialWorkspace.previewSurface) return initialWorkspace.previewSurface;
    const product = [...paintProducts, ...initialWorkspace.customPaintProducts]
      .find((item) => item.id === initialWorkspace.activePaintProductId);
    if (product?.surfaces.includes('wall')) return 'wall';
    if (product?.surfaces.includes('facade')) return 'plaster';
    return product?.surfaces[0] ?? 'wall';
  });
  const [temperature, setTemperature] = useState(initialWorkspace.temperature);
  const [comparison, setComparison] = useState(false);
  const [area, setArea] = useState(initialWorkspace.area);
  const [layers, setLayers] = useState(initialWorkspace.layers);
  const [paintProductId, setPaintProductId] = useState(initialWorkspace.activePaintProductId);
  const [paintPricesByProduct, setPaintPricesByProduct] = useState(initialWorkspace.paintPricesByProduct);
  const [zone, setZone] = useState(initialWorkspace.zone);
  const [projects, setProjects] = useState(initialWorkspace.projects);
  const [clients, setClients] = useState(initialWorkspace.clients);
  const [activeClientId, setActiveClientId] = useState(initialWorkspace.activeClientId);
  const [projectNamesByClient, setProjectNamesByClient] = useState(initialWorkspace.projectNamesByClient);
  const [activeProjectName, setActiveProjectName] = useState(initialWorkspace.activeProjectName);
  const [newProjectName, setNewProjectName] = useState('');
  const [clientNameInput, setClientNameInput] = useState('');
  const [clientPhoneInput, setClientPhoneInput] = useState('');
  const [clientPinInput, setClientPinInput] = useState('');
  const [clientPinConfirmation, setClientPinConfirmation] = useState('');
  const [deletePinInput, setDeletePinInput] = useState('');
  const [remoteProjectsLoaded, setRemoteProjectsLoaded] = useState(!apiBaseUrl);
  const remoteProjectSnapshotsRef = useRef(new Map());
  const remoteProjectsNeedSyncRef = useRef(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [clientCardId, setClientCardId] = useState('');
  const [confirmClientDeletion, setConfirmClientDeletion] = useState(false);
  const clientCardTriggerRef = useRef(null);
  const clientCardCloseRef = useRef(null);
  const remoteCatalogIdsRef = useRef(null);
  const legacyCatalogSyncStartedRef = useRef(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState('Визуализация');
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState('');
  const [visibleCount, setVisibleCount] = useState(24);
  const [catalogShowTop, setCatalogShowTop] = useState(false);
  const [catalogDock, setCatalogDock] = useState({ left: 0, width: '100vw' });
  const [analogMenu, setAnalogMenu] = useState(null);
  const [comparisonIds, setComparisonIds] = useState(initialWorkspace.comparisonIds);
  const [persistenceError, setPersistenceError] = useState(initialWorkspace.error);
  const [expandedColor, setExpandedColor] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [cameraSample, setCameraSample] = useState(null);
  const [apiUser, setApiUser] = useState(null);
  const [remoteCatalogLoaded, setRemoteCatalogLoaded] = useState(!apiBaseUrl);
  const [catalogManagerOpen, setCatalogManagerOpen] = useState(false);
  const [catalogManagerType, setCatalogManagerType] = useState('colors');
  const [catalogSavingId, setCatalogSavingId] = useState('');
  const [customEntryType, setCustomEntryType] = useState('');
  const [editingCatalogEntry, setEditingCatalogEntry] = useState(null);
  const [customColorDraft, setCustomColorDraft] = useState({ code: '', name: '', hex: '#71806A' });
  const [customPaintDraft, setCustomPaintDraft] = useState({ brand: '', name: '', category: 'interior', applications: ['interior'], tintable: null, compatibleMaterials: [], coverage: '10', packages: '0.9, 2.7, 9', finish: '', purpose: '', baseSystem: '', surfaces: ['wall', 'plaster'], tintBases: [], pricePerUnit: '' });
  const cameraVideoRef = useRef(null);
  const cameraCanvasRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const customCatalogFileRef = useRef(null);
  const loadMoreRef = useRef(null);
  const analogMenuRef = useRef(null);
  const catalogPanelRef = useRef(null);
  const holdTimerRef = useRef(null);
  const suppressCardClickRef = useRef(false);
  const skipInitialPersistenceRef = useRef(true);
  const closeCatalog = () => {
    setCatalogOpen(false);
    setCatalogShowTop(false);
  };
  const dismissWelcome = () => {
    setWelcomeOpen(false);
  };
  const handleCatalogScroll = (event) => {
    const panel = event.currentTarget;
    const bounds = panel.getBoundingClientRect();
    setCatalogShowTop(panel.scrollTop > 360);
    setCatalogDock({ left: bounds.left, width: bounds.width });
  };
  const scrollCatalogToTop = () => {
    catalogPanelRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const availableColors = useMemo(() => {
    const overrideIds = new Set(customColors.map((color) => color.id));
    return [
      ...colors.filter((color) => !overrideIds.has(color.id) && !deletedCatalogIds.has(color.id)),
      ...customColors.filter((color) => !deletedCatalogIds.has(color.id)),
    ].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [customColors, deletedCatalogIds]);
  const availableColorsById = useMemo(() => new Map(availableColors.map((color) => [color.id, color])), [availableColors]);
  const availablePaintProducts = useMemo(() => {
    const overrideIds = new Set(customPaintProducts.map((product) => product.id));
    return [
      ...paintProducts.filter((product) => !overrideIds.has(product.id) && !deletedCatalogIds.has(product.id)),
      ...customPaintProducts.filter((product) => !deletedCatalogIds.has(product.id)),
    ].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [customPaintProducts, deletedCatalogIds]);
  const availablePaintProductsById = useMemo(() => new Map(availablePaintProducts.map((product) => [product.id, product])), [availablePaintProducts]);
  const selected = availableColorsById.get(selectedId) ?? availableColors[0] ?? colors[0];
  const currentBase = selected.base;
  const selectedPaintProduct = availablePaintProductsById.get(paintProductId) ?? null;
  const selectedPaintBaseSystem = selectedPaintProduct?.baseSystemByTintBase?.[currentBase]
    ?? selectedPaintProduct?.baseSystem
    ?? '';
  const selectedPaintPackageSizes = selectedPaintProduct
    ? getProductPackageSizes(selectedPaintProduct, currentBase)
    : null;
  const currentSurface = surfaces.find((item) => item.id === surface) ?? surfaces[0];
  const currentTemperature = temperatures.find((item) => item.value === temperature) ?? temperatures[1];
  const projectNames = projectNamesByClient[activeClientId] ?? [defaultProjectName];
  const visibleClients = clients;
  const activeClientRecord = clients.find((client) => client.id === activeClientId) ?? null;
  const activeClient = activeClientRecord;
  const openedClientRecord = clients.find((client) => client.id === clientCardId) ?? null;
  const openedClientCard = openedClientRecord;
  const openedClientProjects = openedClientCard
    ? projects.filter((item) => item.clientId === openedClientCard.id)
    : [];
  const clientProjects = activeClient ? projects.filter((item) => item.clientId === activeClient.id && item.projectName === activeProjectName) : [];
  const quantityUnit = selectedPaintProduct?.quantityUnit === 'kg' ? 'kg' : 'л';
  const paintCoverage = selectedPaintProduct?.coverageBySurface[surface] ?? null;
  const minimumLiters = paintCoverage
    ? quantityUnit === 'kg' ? area * layers * paintCoverage[0] : area * layers / paintCoverage[1]
    : area * layers / currentSurface.rate;
  const liters = paintCoverage
    ? quantityUnit === 'kg' ? area * layers * paintCoverage[1] : area * layers / paintCoverage[0]
    : area * layers / currentSurface.rate;
  const cans = selectedPaintProduct
    ? selectedPaintPackageSizes
      ? optimizeProductPackages(
        liters,
        selectedPaintPackageSizes,
        selectedPaintProduct.tintBases?.includes(currentBase) ? currentBase : '',
      quantityUnit,
    )
    : 'Фасовку уточнить у продавца'
    : optimizeCans(liters, currentBase);
  const paintPricePerLiter = paintProductId ? paintPricesByProduct[paintProductId] : undefined;
  const filteredColors = useMemo(() => filterColors(availableColors, {
    catalog,
    base: baseFilter,
    application: applicationFilter,
    family: familyFilter,
    lightness: lightnessFilter,
    query: search,
  }), [availableColors, catalog, baseFilter, applicationFilter, familyFilter, lightnessFilter, search]);
  const visibleColors = filteredColors.slice(0, visibleCount);

  useEffect(() => {
    if (!projectNames.includes(activeProjectName)) {
      setActiveProjectName(projectNames[0] ?? defaultProjectName);
    }
  }, [activeClientId, projectNamesByClient, activeProjectName]);

  useEffect(() => {
    if (!apiBaseUrl) return undefined;
    let active = true;
    const savedLocalClientIds = new Set(clients.filter((client) => !client.remote).map((client) => client.id));
    apiRequest('/clients', { token: '' })
      .then(async ({ clients: remoteClients = [] }) => {
        if (!active) return;
        const remoteClientsById = new Map(remoteClients
          .filter((client) => typeof client?.id === 'string' && typeof client.name === 'string')
          .map((client) => [client.id, client]));
        const validClientIds = new Set([...savedLocalClientIds, ...remoteClientsById.keys()]);
        setClients((localClients) => {
          const merged = new Map(localClients.filter((client) => !client.remote).map((client) => [client.id, client]));
          for (const client of remoteClientsById.values()) {
            merged.set(client.id, {
              id: client.id,
              name: client.name,
              phoneLast4: String(client.phoneLast4 ?? '').replace(/\D/g, '').slice(-4),
              createdAt: typeof client.createdAt === 'string' ? client.createdAt : '',
              hasPin: client.hasPin === true,
              remote: true,
            });
          }
          return [...merged.values()].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        });
        setProjects((items) => items.filter((project) => validClientIds.has(project.clientId)).map((project) => {
          const client = remoteClientsById.get(project.clientId);
          return client ? { ...project, clientName: client.name, clientPhoneLast4: client.phoneLast4 } : project;
        }));
        setProjectNamesByClient((items) => Object.fromEntries(
          Object.entries(items).filter(([clientId]) => validClientIds.has(clientId)),
        ));
        setActiveClientId((currentId) => validClientIds.has(currentId) ? currentId : remoteClients[0]?.id || '');
        const { projects: remoteProjectRecords = [] } = await apiRequest('/projects', { token: '' });
        if (!active) return;
        const remoteProjects = remoteProjectRecords.flatMap((record) => {
          const client = remoteClientsById.get(record.clientId);
          if (!client || !Array.isArray(record.projects)) return [];
          return record.projects.flatMap((project) => {
            const colorId = project?.color?.id;
            const color = typeof colorId === 'string'
              ? availableColorsById.get(colorId) ?? normalizeCustomColor(project.color) ?? getArchivedWoodProjectColor(colorId)
              : null;
            if (!color || typeof project.key !== 'string') return [];
            const paintProduct = typeof project.paintProduct?.id === 'string'
              ? availablePaintProductsById.get(project.paintProduct.id) ?? normalizeCustomPaintProduct(project.paintProduct) ?? project.paintProduct
              : null;
            return [{
              ...project,
              clientId: client.id,
              clientName: client.name,
              clientPhoneLast4: client.phoneLast4,
              color,
              base: color.base,
              paintProduct,
            }];
          });
        });
        const mergedProjectMap = new Map(projects
          .filter((project) => validClientIds.has(project.clientId))
          .map((project) => [project.key, project]));
        for (const project of remoteProjects) mergedProjectMap.set(project.key, project);
        const mergedProjects = [...mergedProjectMap.values()];
        setProjects(mergedProjects);
        const remoteNamesByClient = Object.fromEntries(remoteProjectRecords
          .filter((record) => remoteClientsById.has(record.clientId) && Array.isArray(record.projectNames))
          .map((record) => [record.clientId, record.projectNames.filter((name) => typeof name === 'string')]));
        const mergedNames = Object.fromEntries([...validClientIds].map((clientId) => [clientId, [...new Set([
          ...(projectNamesByClient[clientId] ?? []),
          ...(remoteNamesByClient[clientId] ?? []),
          defaultProjectName,
        ])]]));
        setProjectNamesByClient(mergedNames);
        remoteProjectSnapshotsRef.current = new Map([...remoteClientsById.keys()].map((clientId) => [
          clientId,
          sharedProjectsSnapshot(mergedProjects, mergedNames[clientId], clientId),
        ]));
        remoteProjectsNeedSyncRef.current = new Set([...remoteClientsById.keys()].filter((clientId) => (
          projects.some((project) => project.clientId === clientId && !remoteProjects.some((remoteProject) => remoteProject.key === project.key))
          || (projectNamesByClient[clientId] ?? []).some((name) => !(remoteNamesByClient[clientId] ?? []).includes(name))
        )));
        setRemoteProjectsLoaded(true);
      })
      .catch((error) => {
        if (active) setToast(error instanceof Error ? error.message : 'Не удалось загрузить карточки клиентов.');
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!remoteProjectsLoaded || !apiBaseUrl) return undefined;
    let active = true;
    const timer = window.setTimeout(async () => {
      for (const client of clients.filter((item) => item.remote)) {
        const snapshot = sharedProjectsSnapshot(projects, projectNamesByClient[client.id], client.id);
        if (!remoteProjectsNeedSyncRef.current.has(client.id) && remoteProjectSnapshotsRef.current.get(client.id) === snapshot) continue;
        try {
          await apiRequest(`/projects/${encodeURIComponent(client.id)}`, {
            method: 'PUT',
            body: snapshot,
          });
          remoteProjectSnapshotsRef.current.set(client.id, snapshot);
          remoteProjectsNeedSyncRef.current.delete(client.id);
        } catch (error) {
          if (active) setToast(error instanceof Error ? error.message : 'Не удалось синхронизировать проекты клиента.');
          return;
        }
      }
    }, 900);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [clients, projects, projectNamesByClient, remoteProjectsLoaded]);
  const comparedColors = comparisonIds.map((id) => availableColorsById.get(id)).filter(Boolean);
  const recommendations = useMemo(
    () => getColorRecommendations(availableColors, selected, comparisonIds),
    [availableColors, selected, comparisonIds],
  );
  const cameraMatches = useMemo(
    () => cameraSample ? getClosestColorMatches(availableColors, cameraSample.rgb) : [],
    [availableColors, cameraSample],
  );
  const selectedCameraDistance = cameraSample
    ? deltaEFromLab(rgbToLab(cameraSample.rgb), rgbToLab(selected.rgb))
    : null;

  useEffect(() => {
    setVisibleCount(24);
    setAnalogMenu(null);
  }, [catalog, baseFilter, applicationFilter, familyFilter, lightnessFilter, search]);

  useEffect(() => {
    if (skipInitialPersistenceRef.current) {
      skipInitialPersistenceRef.current = false;
      return;
    }
    try {
      const storedProjects = projects.map(({ key, clientId, projectName, color, zone, area: projectArea, layers: projectLayers, surface: projectSurface, liters: projectLiters, cans: projectCans, paintProduct }) => ({
        key,
        clientId,
        projectName,
        color,
        zone,
        area: projectArea,
        layers: projectLayers,
        surface: projectSurface,
        liters: projectLiters,
        quantity: projectLiters,
        quantityUnit: projects.find((item) => item.key === key)?.quantityUnit ?? 'л',
        cans: projectCans,
        paintProduct: paintProduct ? { ...paintProduct, pricePerUnit: paintProduct.pricePerUnit ?? paintProduct.pricePerLiter } : null,
      }));
      window.localStorage.setItem(workspaceStorageKey, JSON.stringify({
        version: 2,
        clients: clients.map(({ id, name, phoneLast4, createdAt, remote }) => ({ id, name, phoneLast4, createdAt, remote })),
        projects: storedProjects,
        customColors,
        customPaintProducts,
        deletedCatalogIds: [...deletedCatalogIds],
        projectNamesByClient,
        activeProjectName,
        activeClientId,
        activePaintProductId: paintProductId,
        paintPricesByProduct,
        selectedColorId: selectedId,
        comparisonIds,
        previewSurface,
        temperature,
        area,
        layers,
        zone,
      }));
      setPersistenceError(false);
    } catch (error) {
      console.error('Не удалось сохранить локальные данные KolorLab.', error);
      setPersistenceError(true);
    }
  }, [clients, projects, customColors, customPaintProducts, deletedCatalogIds, activeClientId, activeProjectName, projectNamesByClient, paintProductId, paintPricesByProduct, selectedId, comparisonIds, previewSurface, temperature, area, layers, zone]);

  useEffect(() => {
    if (!apiBaseUrl) return undefined;
    let active = true;
    apiRequest('/catalog', { token: '' })
      .then(({ colors: remoteColors = [], paintProducts: remotePaints = [] }) => {
        if (!active) return;
        const deletedIds = new Set([...remoteColors, ...remotePaints]
          .filter((entry) => entry?.deleted === true && typeof entry.id === 'string')
          .map((entry) => entry.id));
        const normalizedColors = remoteColors
          .filter((color) => color?.deleted !== true)
          .map((color) => normalizeCustomColor({
            ...color,
            catalog: color.catalog ?? colors.find((entry) => entry.id === color.id)?.catalog,
          }))
          .filter(Boolean);
        const normalizedPaints = remotePaints.filter((paint) => paint?.deleted !== true).map(normalizeCustomPaintProduct).filter(Boolean);
        remoteCatalogIdsRef.current = new Set([...remoteColors, ...remotePaints]
          .filter((entry) => typeof entry?.id === 'string')
          .map((entry) => entry.id));
        setDeletedCatalogIds(deletedIds);
        setCustomColors((local) => mergeCustomCatalog(
          local.filter((entry) => !deletedIds.has(entry.id)),
          normalizedColors,
        ).entries);
        setCustomPaintProducts((local) => mergeCustomCatalog(
          local.filter((entry) => !deletedIds.has(entry.id)),
          normalizedPaints,
        ).entries);
        setRemoteCatalogLoaded(true);
        setPaintPricesByProduct((prices) => ({
          ...prices,
          ...Object.fromEntries(remotePaints
            .filter((paint) => typeof paint?.id === 'string' && Number.isFinite(paint.pricePerUnit ?? paint.pricePerLiter) && (paint.pricePerUnit ?? paint.pricePerLiter) >= 0)
            .map((paint) => [paint.id, paint.pricePerUnit ?? paint.pricePerLiter])),
        }));
      })
      .catch((error) => {
        if (active) setToast(error instanceof Error ? error.message : 'Не удалось загрузить общую базу.');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!apiUser?.isAdmin || !remoteCatalogLoaded || !remoteCatalogIdsRef.current || legacyCatalogSyncStartedRef.current) return;
    const missingColors = customColors.filter((color) => !remoteCatalogIdsRef.current.has(color.id));
    const missingPaints = customPaintProducts.filter((paint) => !remoteCatalogIdsRef.current.has(paint.id));
    legacyCatalogSyncStartedRef.current = true;
    if (!missingColors.length && !missingPaints.length) return;
    const syncLegacyCatalog = async () => {
      let savedCount = 0;
      try {
        for (const color of missingColors) {
          await apiRequest(`/catalog/colors/${encodeURIComponent(color.id)}`, { method: 'PUT', body: JSON.stringify(color) });
          savedCount += 1;
        }
        for (const paint of missingPaints) {
          await apiRequest(`/catalog/paints/${encodeURIComponent(paint.id)}`, {
            method: 'PUT',
            body: JSON.stringify({
              ...paint,
              pricePerLiter: Number.isFinite(paintPricesByProduct[paint.id]) ? paintPricesByProduct[paint.id] : null,
            }),
          });
          savedCount += 1;
        }
        missingColors.concat(missingPaints).forEach((entry) => remoteCatalogIdsRef.current.add(entry.id));
        setToast(`${savedCount} старых записей перенесено в общую базу GitHub`);
      } catch (error) {
        setToast(`${savedCount} старых записей сохранено; перенос остановлен: ${error instanceof Error ? error.message : 'ошибка GitHub'}. Обновите страницу, чтобы повторить.`);
      }
    };
    syncLegacyCatalog();
  }, [apiUser, remoteCatalogLoaded, customColors, customPaintProducts, paintPricesByProduct]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || visibleCount >= filteredColors.length) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setVisibleCount((count) => Math.min(count + 24, filteredColors.length));
      }
    }, { root: sentinel.closest('.catalog-drawer-panel'), rootMargin: '240px 0px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filteredColors.length, visibleCount]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!cameraOpen) return undefined;
    let cancelled = false;
    let stream = null;
    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Камера недоступна в этом браузере. Откройте сайт по HTTPS и проверьте поддержку камеры.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' } },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        cameraStreamRef.current = stream;
        if (!cameraVideoRef.current) throw new Error('Не удалось подготовить окно камеры.');
        cameraVideoRef.current.srcObject = stream;
        await cameraVideoRef.current.play();
      } catch (error) {
        stream?.getTracks().forEach((track) => track.stop());
        cameraStreamRef.current = null;
        if (cancelled) return;
        if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
          setCameraError('Нет доступа к камере. Разрешите использование камеры в настройках браузера и попробуйте снова.');
        } else if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
          setCameraError('Камера не найдена или недоступна на этом устройстве.');
        } else {
          setCameraError('Не удалось запустить камеру. Проверьте, что она не используется другим приложением, и попробуйте снова.');
        }
      }
    };
    startCamera();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
      if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null;
    };
  }, [cameraOpen]);

  useEffect(() => {
    if (!cameraOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setCameraOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [cameraOpen]);

  useEffect(() => {
    if (!customEntryType) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setCustomEntryType('');
        setEditingCatalogEntry(null);
        setCatalogManagerOpen(true);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [apiUser?.isAdmin, customEntryType]);

  useEffect(() => {
    const hiddenOnMobileTab = activeMobileTab !== 'Визуализация'
      && window.matchMedia('(max-width: 1279px)').matches;
    if (cameraOpen && (hiddenOnMobileTab || catalogOpen || drawerOpen)) setCameraOpen(false);
  }, [activeMobileTab, cameraOpen, catalogOpen, drawerOpen]);

  useEffect(() => {
    if (!clientCardId) return undefined;
    clientCardCloseRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setClientCardId('');
        setConfirmClientDeletion(false);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [clientCardId]);

  useEffect(() => {
    if (!analogMenu) return undefined;
    const dismissOnOutsidePointer = (event) => {
      if (!analogMenuRef.current?.contains(event.target)) setAnalogMenu(null);
    };
    const dismissOnEscape = (event) => {
      if (event.key === 'Escape') setAnalogMenu(null);
    };
    document.addEventListener('pointerdown', dismissOnOutsidePointer);
    document.addEventListener('keydown', dismissOnEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissOnOutsidePointer);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [analogMenu]);

  useEffect(() => {
    if (!expandedColor) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setExpandedColor(null);
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [expandedColor]);

  useEffect(() => {
    if (!catalogOpen || window.matchMedia('(min-width: 1280px)').matches) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') closeCatalog();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [catalogOpen]);

  useEffect(() => {
    if (!catalogOpen) return undefined;
    const updateDockPosition = () => {
      const panel = catalogPanelRef.current;
      if (!panel) return;
      const bounds = panel.getBoundingClientRect();
      setCatalogDock({ left: bounds.left, width: bounds.width });
    };
    updateDockPosition();
    window.addEventListener('resize', updateDockPosition);
    return () => window.removeEventListener('resize', updateDockPosition);
  }, [catalogOpen]);

  const selectColor = (color) => {
    setSelectedId(color.id);
    setActiveMobileTab('Визуализация');
    setCatalogOpen(false);
  };

  const openCatalogEntryForm = (type, entry = null) => {
    setEditingCatalogEntry(entry);
    if (type === 'color') {
      setCustomColorDraft(entry
        ? { code: entry.code, name: entry.name_ru, hex: entry.hex }
        : { code: '', name: '', hex: '#71806A' });
    } else {
      const firstCoverage = Object.values(entry?.coverageBySurface ?? {})[0]?.[0] ?? 10;
      const metadata = entry ? getPaintProductMetadata(entry) : null;
      setCustomPaintDraft(entry ? {
        brand: entry.brand,
        name: entry.name,
        category: metadata.category,
        applications: [...metadata.applications],
        tintable: metadata.tintable,
        compatibleMaterials: [...metadata.compatibleMaterials],
        coverage: String(firstCoverage),
        packages: (entry.quantityUnit === 'kg' ? entry.packageSizesKg : entry.packageSizesLiters)?.join(', ') ?? '',
        finish: entry.finish === 'Не указано' ? '' : entry.finish,
        purpose: entry.purpose,
        baseSystem: entry.baseSystem === 'Совместимость баз не указана.' ? '' : entry.baseSystem,
        surfaces: [...entry.surfaces],
        tintBases: [...metadata.tintBases],
        pricePerUnit: Number.isFinite(paintPricesByProduct[entry.id]) ? String(paintPricesByProduct[entry.id]) : '',
      } : { brand: '', name: '', category: 'interior', applications: ['interior'], tintable: null, compatibleMaterials: [], coverage: '10', packages: '0.9, 2.7, 9', finish: '', purpose: '', baseSystem: '', surfaces: ['wall', 'plaster'], tintBases: [], pricePerUnit: '' });
    }
    setCatalogManagerOpen(false);
    setCatalogManagerType(type === 'color' ? 'colors' : 'paints');
    setCustomEntryType(type);
  };

  const closeCatalogEntryForm = () => {
    setCustomEntryType('');
    setEditingCatalogEntry(null);
    setCatalogManagerOpen(true);
  };

  const addCustomColor = async (event) => {
    event.preventDefault();
    const editing = editingCatalogEntry;
    const color = normalizeCustomColor({
      id: editing?.id ?? `custom-color-${globalThis.crypto.randomUUID()}`,
      code: customColorDraft.code,
      name_ru: customColorDraft.name,
      hex: customColorDraft.hex,
      catalog: editing?.catalog,
      createdAt: editing?.createdAt || new Date().toISOString(),
    });
    if (!color) {
      setToast('Укажите название и код цвета, а также корректный HEX');
      return;
    }
    setCatalogSavingId(color.id);
    try {
      await apiRequest(`/catalog/colors/${encodeURIComponent(color.id)}`, {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify(color),
      });
      setCustomColors((items) => editing
        ? items.some((item) => item.id === color.id)
          ? items.map((item) => item.id === color.id ? color : item)
          : [...items, color]
        : [...items, color]);
      setDeletedCatalogIds((ids) => {
        const next = new Set(ids);
        next.delete(color.id);
        return next;
      });
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Не удалось сохранить цвет в GitHub.');
      setCatalogSavingId('');
      return;
    }
    setCatalogSavingId('');
    setSelectedId(color.id);
    setCustomEntryType('');
    setEditingCatalogEntry(null);
    setCustomColorDraft({ code: '', name: '', hex: '#71806A' });
    setCatalog(customColorsCatalog);
    setSearch('');
    setBaseFilter('Все базы');
    setApplicationFilter('all');
    setFamilyFilter('Все семейства');
    setLightnessFilter('Любая светлота');
    setActiveMobileTab('Визуализация');
    setCatalogOpen(true);
    setCatalogManagerOpen(true);
    setToast(editing ? `${color.code} обновлён в общей базе GitHub` : `${color.code} добавлен в общую базу GitHub`);
  };

  const addCustomPaintProduct = async (event) => {
    event.preventDefault();
    const editing = editingCatalogEntry;
    const brand = customPaintDraft.brand.trim();
    const name = customPaintDraft.name.trim();
    const coverage = Number(customPaintDraft.coverage);
    const selectedSurfaces = (customPaintDraft.surfaces.length
      ? customPaintDraft.surfaces
      : customPaintDraft.category === 'plaster' ? ['plaster'] : ['wall', 'plaster'])
      .filter((id) => surfacesCatalogIds.has(id));
    const packageInput = customPaintDraft.packages.trim();
    const packageSizes = packageInput
      ? packageInput.split(',').map((item) => Number(item.trim()))
      : [];
    const pricePerUnit = customPaintDraft.pricePerUnit.trim() ? Number(customPaintDraft.pricePerUnit) : null;
    if (!brand || !name || !Number.isFinite(coverage) || coverage <= 0 || coverage > 100 || !selectedSurfaces.length) {
      setToast('Заполните бренд, название и корректный расход.');
      return;
    }
    if (pricePerUnit !== null && (!Number.isFinite(pricePerUnit) || pricePerUnit < 0 || pricePerUnit > 1_000_000)) {
      setToast('Укажите корректную цену за единицу или оставьте поле пустым.');
      return;
    }
    if (packageInput && (!packageSizes.length || packageSizes.some((size) => !Number.isFinite(size) || size <= 0 || size > 100))) {
      setToast('Укажите фасовки числами через запятую, например: 0.9, 2.7, 9');
      return;
    }
    const tintBases = customPaintDraft.tintable === false ? [] : customPaintDraft.tintBases.filter((base) => base === 'A' || base === 'C');
    const product = normalizeCustomPaintProduct({
      id: editing?.id ?? `custom-paint-${globalThis.crypto.randomUUID()}`,
      brand,
      name,
      finish: customPaintDraft.finish,
      purpose: customPaintDraft.purpose,
      coverageBySurface: Object.fromEntries(selectedSurfaces.map((id) => [id, [coverage, coverage]])),
      createdAt: editing?.createdAt || new Date().toISOString(),
      coverageDescription: customPaintDraft.category === 'plaster'
        ? `${coverage.toLocaleString('ru-RU')} кг/м² · расход задан пользователем`
        : `${coverage.toLocaleString('ru-RU')} м²/л · значение задано пользователем`,
      baseSystem: customPaintDraft.baseSystem,
      packageSizesLiters: customPaintDraft.category === 'plaster' ? null : packageSizes,
      packageSizesKg: customPaintDraft.category === 'plaster' ? packageSizes : null,
      quantityUnit: customPaintDraft.category === 'plaster' ? 'kg' : 'L',
      tintBases,
      paintCategory: customPaintDraft.category,
      applications: customPaintDraft.applications,
      tintable: customPaintDraft.tintable,
      compatibleMaterials: customPaintDraft.compatibleMaterials,
    });
    if (!product) {
      setToast('Не удалось проверить параметры краски. Проверьте поля и попробуйте снова.');
      return;
    }
    setCatalogSavingId(product.id);
    try {
      await apiRequest(`/catalog/paints/${encodeURIComponent(product.id)}`, {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify({ ...product, pricePerUnit }),
      });
      setCustomPaintProducts((items) => editing
        ? items.some((item) => item.id === product.id)
          ? items.map((item) => item.id === product.id ? product : item)
          : [...items, product]
        : [...items, product]);
      setDeletedCatalogIds((ids) => {
        const next = new Set(ids);
        next.delete(product.id);
        return next;
      });
      setPaintPricesByProduct((prices) => {
        const next = { ...prices };
        if (pricePerUnit === null) delete next[product.id];
        else next[product.id] = pricePerUnit;
        return next;
      });
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Не удалось сохранить краску в GitHub.');
      setCatalogSavingId('');
      return;
    }
    setCatalogSavingId('');
    setPaintProductId(product.id);
    if (!product.surfaces.includes(surface)) setSurface(product.surfaces[0]);
    const nextPreview = visualSurfaces.find((item) => product.surfaces.includes(item.calculatorSurface));
    if (nextPreview) setPreviewSurface(nextPreview.id);
    setCustomEntryType('');
    setEditingCatalogEntry(null);
    setCatalogManagerOpen(true);
    setActiveMobileTab('Краски');
    setToast(editing
      ? `${product.brand} · ${product.name} обновлена в общей базе GitHub`
      : `${product.brand} · ${product.name} добавлена в общую базу GitHub`);
  };

  const deleteCatalogEntry = async (type, entry) => {
    const label = type === 'color' ? `${entry.code} · ${entry.name_ru}` : `${entry.brand} · ${entry.name}`;
    if (!window.confirm(`Удалить «${label}» из общей базы GitHub? Это действие нельзя отменить.`)) return;
    setCatalogSavingId(entry.id);
    try {
      await apiRequest(`/catalog/${type === 'color' ? 'colors' : 'paints'}/${encodeURIComponent(entry.id)}`, {
        method: 'DELETE',
      });
      if (type === 'color') {
        setCustomColors((items) => items.filter((item) => item.id !== entry.id));
        setDeletedCatalogIds((ids) => new Set([...ids, entry.id]));
        setComparisonIds((items) => items.filter((id) => id !== entry.id));
        if (selectedId === entry.id) {
          const nextColor = availableColors.find((color) => color.id !== entry.id)
            ?? colors.find((color) => color.id !== entry.id);
          if (nextColor) setSelectedId(nextColor.id);
        }
        if (expandedColor?.id === entry.id) setExpandedColor(null);
      } else {
        setCustomPaintProducts((items) => items.filter((item) => item.id !== entry.id));
        setDeletedCatalogIds((ids) => new Set([...ids, entry.id]));
        setPaintPricesByProduct((prices) => {
          const next = { ...prices };
          delete next[entry.id];
          return next;
        });
        if (paintProductId === entry.id) {
          const nextProduct = availablePaintProducts.find((product) => product.id !== entry.id);
          setPaintProductId(nextProduct?.id ?? '');
        }
      }
      setToast(`${label} удалён из общей базы GitHub.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Не удалось удалить запись из GitHub.');
    } finally {
      setCatalogSavingId('');
    }
  };

  const savePaintPriceToGithub = async () => {
    const product = customPaintProducts.find((item) => item.id === paintProductId);
    if (!apiUser?.isAdmin || !product) return;
    setCatalogSavingId(product.id);
    try {
      await apiRequest(`/catalog/paints/${encodeURIComponent(product.id)}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...product,
          pricePerLiter: Number.isFinite(paintPricesByProduct[product.id]) ? paintPricesByProduct[product.id] : null,
        }),
      });
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Не удалось сохранить цену краски в GitHub.');
    } finally {
      setCatalogSavingId('');
    }
  };

  const exportCustomCatalog = async () => {
    const fileName = `KolorLab-catalog-${new Date().toISOString().slice(0, 10)}.json`;
    const fileContents = JSON.stringify(
      createCustomCatalogDocument(customColors, customPaintProducts, paintPricesByProduct),
      null,
      2,
    );
    if (Capacitor.isNativePlatform()) {
      let temporaryPath = '';
      try {
        const savedFile = await Filesystem.writeFile({
          path: fileName,
          data: fileContents,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        });
        temporaryPath = fileName;
        const { value: canShareFile } = await Share.canShare();
        if (!canShareFile) throw new Error('Обмен файлами недоступен на этом устройстве.');
        await Share.share({
          title: 'База цветов и красок KolorLab',
          text: 'Файл пользовательской базы KolorLab. Сохраните его или передайте на другое устройство.',
          files: [savedFile.uri],
          dialogTitle: 'Сохранить или передать базу',
        });
        setToast('Файл базы подготовлен для сохранения или передачи');
      } catch (error) {
        console.error('Не удалось экспортировать базу KolorLab из приложения.', error);
        setToast(error instanceof Error ? error.message : 'Не удалось экспортировать базу из приложения.');
      } finally {
        if (temporaryPath) {
          try {
            await Filesystem.deleteFile({ path: temporaryPath, directory: Directory.Cache });
          } catch (error) {
            console.error('Не удалось удалить временный файл базы KolorLab.', error);
          }
        }
      }
      return;
    }
    const blob = new Blob([fileContents], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast('База скачана. Импортируйте файл в приложении или на другом устройстве.');
  };

  const importCustomCatalog = async (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (!apiUser?.isAdmin) throw new Error('Импортировать записи может только администратор.');
      if (file.size > 2 * 1024 * 1024) throw new Error('Файл слишком большой. Максимальный размер — 2 МБ.');
      const document = JSON.parse(await file.text());
      const imported = parseCustomCatalogDocument(document);
      const colorMerge = mergeCustomCatalog(customColors, imported.colors);
      const paintMerge = mergeCustomCatalog(customPaintProducts, imported.paintProducts);
      const writes = [
        ...imported.colors.map((color) => apiRequest(`/catalog/colors/${encodeURIComponent(color.id)}`, {
          method: 'PUT',
          body: JSON.stringify(color),
        })),
        ...imported.paintProducts.map((paint) => apiRequest(`/catalog/paints/${encodeURIComponent(paint.id)}`, {
          method: 'PUT',
          body: JSON.stringify({
            ...paint,
            pricePerLiter: imported.paintPricesByProduct[paint.id] ?? null,
          }),
        })),
      ];
      await Promise.all(writes);
      setCustomColors(colorMerge.entries);
      setCustomPaintProducts(paintMerge.entries);
      setPaintPricesByProduct((prices) => ({ ...prices, ...imported.paintPricesByProduct }));
      const added = colorMerge.added + paintMerge.added;
      const updated = colorMerge.updated + paintMerge.updated;
      const skipped = imported.invalidCount;
      setToast(added || updated
        ? `Импортировано: новых записей ${added}, обновлено ${updated}${skipped ? `, пропущено некорректных ${skipped}` : ''}`
        : skipped
          ? `Новых записей нет. Пропущено некорректных: ${skipped}`
          : 'Эта база уже добавлена — изменений нет');
    } catch (error) {
      const message = error instanceof SyntaxError
        ? 'Не удалось прочитать JSON. Выберите файл базы, экспортированный из KolorLab.'
        : error instanceof Error
          ? error.message
          : 'Не удалось импортировать файл базы.';
      setToast(message);
    } finally {
      input.value = '';
    }
  };

  const sampleCameraPixel = (clientX, clientY) => {
    const video = cameraVideoRef.current;
    const canvas = cameraCanvasRef.current;
    if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setCameraError('Камера ещё загружается. Подождите немного и повторите выбор.');
      return;
    }
    const { videoWidth, videoHeight } = video;
    const bounds = video.getBoundingClientRect();
    const scale = Math.min(bounds.width / videoWidth, bounds.height / videoHeight);
    const renderedWidth = videoWidth * scale;
    const renderedHeight = videoHeight * scale;
    const offsetX = (bounds.width - renderedWidth) / 2;
    const offsetY = (bounds.height - renderedHeight) / 2;
    const localX = clientX - bounds.left - offsetX;
    const localY = clientY - bounds.top - offsetY;
    if (localX < 0 || localY < 0 || localX > renderedWidth || localY > renderedHeight) return;

    canvas.width = videoWidth;
    canvas.height = videoHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      setCameraError('Не удалось обработать изображение с камеры. Попробуйте обновить страницу.');
      return;
    }
    context.drawImage(video, 0, 0, videoWidth, videoHeight);
    const centerX = Math.round(localX / scale);
    const centerY = Math.round(localY / scale);
    const startX = Math.max(0, Math.min(videoWidth - 5, centerX - 2));
    const startY = Math.max(0, Math.min(videoHeight - 5, centerY - 2));
    const pixels = context.getImageData(startX, startY, Math.min(5, videoWidth), Math.min(5, videoHeight)).data;
    const rgb = [0, 0, 0];
    const pixelCount = pixels.length / 4;
    for (let index = 0; index < pixels.length; index += 4) {
      rgb[0] += pixels[index];
      rgb[1] += pixels[index + 1];
      rgb[2] += pixels[index + 2];
    }
    const averageRgb = rgb.map((channel) => Math.round(channel / pixelCount));
    const hex = `#${averageRgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
    setCameraSample({ rgb: averageRgb, hex });
    setCameraError('');
  };

  const handleCameraSample = (event) => {
    sampleCameraPixel(event.clientX, event.clientY);
  };

  const sampleCameraCenter = () => {
    const bounds = cameraVideoRef.current?.getBoundingClientRect();
    if (!bounds) return;
    sampleCameraPixel(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
  };

  const showAnalogMenu = (color, anchor) => {
    const rect = anchor.getBoundingClientRect();
    const menuWidth = Math.min(320, window.innerWidth - 24);
    const menuHeight = 340;
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - menuWidth - 12);
    const below = rect.bottom + 8;
    const top = below + menuHeight <= window.innerHeight - 12
      ? below
      : Math.max(12, rect.top - menuHeight - 8);
    setAnalogMenu({
      source: color,
      alternatives: getCatalogAlternatives(color, availableColors),
      style: { top, left, width: menuWidth },
    });
  };

  const startCardHold = (event, color) => {
    if (event.button !== 0) return;
    window.clearTimeout(holdTimerRef.current);
    suppressCardClickRef.current = false;
    const anchor = event.currentTarget;
    holdTimerRef.current = window.setTimeout(() => {
      suppressCardClickRef.current = true;
      showAnalogMenu(color, anchor);
    }, 500);
  };

  const endCardHold = () => {
    window.clearTimeout(holdTimerRef.current);
    if (suppressCardClickRef.current) {
      window.setTimeout(() => { suppressCardClickRef.current = false; }, 0);
    }
  };

  const cancelCardHold = () => {
    window.clearTimeout(holdTimerRef.current);
  };

  const addToProject = () => {
    if (!activeClient) {
      setDrawerOpen(true);
      setToast('Сначала выберите или добавьте клиента');
      return;
    }
    setProjects((items) => [...items, {
      key: `${selected.id}-${Date.now()}`,
      clientId: activeClient.id,
      projectName: activeProjectName,
      clientName: activeClient.name,
      clientPhoneLast4: activeClient.phoneLast4,
      color: selected,
      base: currentBase,
      zone,
      area,
      layers,
      surface,
      liters,
      quantity: liters,
      quantityUnit,
      cans,
      paintProduct: selectedPaintProduct ? {
        ...selectedPaintProduct,
        pricePerUnit: Number.isFinite(paintPricePerLiter) ? paintPricePerLiter : null,
        pricePerLiter: Number.isFinite(paintPricePerLiter) ? paintPricePerLiter : null,
      } : null,
    }]);
    setToast(`${selected.code} добавлен в проект`);
  };

  const projectCost = clientProjects.reduce((total, item) => total + (Number.isFinite(item.paintProduct?.pricePerUnit ?? item.paintProduct?.pricePerLiter) ? item.liters * (item.paintProduct.pricePerUnit ?? item.paintProduct.pricePerLiter) : 0), 0);
  const orderText = clientProjects.length
    ? `KOLORLAB · СПЕЦИФИКАЦИЯ КОЛЕРОВКИ\nПроект: ${activeProjectName}\nКлиент: ${activeClient.name} · •••• ${activeClient.phoneLast4}\n\n${clientProjects.map((item, index) => `${index + 1}. ${item.zone} — ${item.color.code}, ${item.color.name_ru}\n   Каталог: ${item.color.catalog} · ${item.color.hex}\n   Краска: ${item.paintProduct ? `${item.paintProduct.brand} ${item.paintProduct.name}` : 'не выбрана'}\n   Система баз продукта: ${item.paintProduct?.baseSystem ?? 'не выбрана'}${item.paintProduct?.availabilityNote ? `\n   Важно: ${item.paintProduct.availabilityNote}` : ''}\n   Площадь: ${item.area ?? '—'} м² · слоёв: ${item.layers ?? '—'}\n   Колеровочная база оттенка: ${item.base ? `База ${item.base}` : 'не требуется'} · ${item.liters.toFixed(1).replace('.', ',')} ${item.quantityUnit ?? 'л'} (${item.cans})${Number.isFinite(item.paintProduct?.pricePerUnit ?? item.paintProduct?.pricePerLiter) ? `\n   Ориентировочная стоимость: ${(item.liters * (item.paintProduct.pricePerUnit ?? item.paintProduct.pricePerLiter)).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽` : ''}`).join('\n\n')}\n\nИтого материалов: ${clientProjects.reduce((total, item) => total + item.liters, 0).toFixed(1).replace('.', ',')} · единица указана в каждой позиции${projectCost ? `\nОриентировочная стоимость известных позиций: ${projectCost.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽` : ''}\n\nПеред покупкой уточните у продавца совместимость оттенка, системы баз и фасовки.`
    : '';

  const createProject = (event) => {
    event.preventDefault();
    if (!activeClient) {
      setToast('Сначала выберите клиента, чтобы создать отдельный проект.');
      return;
    }
    const name = newProjectName.trim();
    if (!name) {
      setToast('Введите название проекта');
      return;
    }
    const existing = projectNames.find((projectName) => projectName.toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru'));
    if (existing) {
      setActiveProjectName(existing);
      setNewProjectName('');
      setToast(`Открыт проект «${existing}»`);
      return;
    }
    setProjectNamesByClient((items) => ({
      ...items,
      [activeClient.id]: [...new Set([...(items[activeClient.id] ?? [defaultProjectName]), name])],
    }));
    setActiveProjectName(name);
    setNewProjectName('');
    setToast(`Создан проект «${name}»`);
  };

  const addClient = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = clientNameInput.trim();
    const phoneDigits = clientPhoneInput.replace(/\D/g, '');
    if (!name || phoneDigits.length < 10) {
      setToast('Укажите имя клиента и номер телефона');
      return;
    }
    if (!/^\d{6}$/.test(clientPinInput) || clientPinInput !== clientPinConfirmation) {
      setToast('Задайте и подтвердите шестизначный PIN-код карточки.');
      return;
    }
    if (formData.get('clientConsent') !== 'on') {
      setToast('Подтвердите согласие клиента на хранение номера телефона.');
      return;
    }
    let client;
    try {
      const { client: savedClient } = await apiRequest('/clients', {
        method: 'PUT',
        body: JSON.stringify({ name, phone: clientPhoneInput, consent: true, pin: clientPinInput }),
      });
      client = {
        id: savedClient.id,
        name: savedClient.name,
        phoneLast4: savedClient.phoneLast4,
        createdAt: savedClient.createdAt,
        hasPin: savedClient.hasPin === true,
        remote: true,
      };
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Не удалось сохранить клиента в GitHub.');
      return;
    }
    setClients((items) => [client, ...items.filter((item) => item.id !== client.id)]);
    setActiveClientId(client.id);
    setProjectNamesByClient((items) => ({
      ...items,
      [client.id]: [...new Set([...(items[client.id] ?? [defaultProjectName]), defaultProjectName])],
    }));
    setClientNameInput('');
    setClientPhoneInput('');
    setClientPinInput('');
    setClientPinConfirmation('');
    setDrawerOpen(false);
  };

  const deleteClient = async () => {
    if (!openedClientCard) return;
    if (!openedClientCard.hasPin) {
      setToast('Эту карточку нельзя удалить: она создана до введения PIN-кода.');
      return;
    }
    if (!/^\d{6}$/.test(deletePinInput)) {
      setToast('Введите шестизначный PIN-код клиента.');
      return;
    }
    const removedProjectCount = openedClientProjects.length;
    if (openedClientCard.remote) {
      try {
        await apiRequest(`/clients/${encodeURIComponent(openedClientCard.id)}`, {
          method: 'DELETE',
          body: JSON.stringify({ pin: deletePinInput }),
        });
      } catch (error) {
        setToast(error instanceof Error ? error.message : 'Не удалось удалить клиента из GitHub.');
        return;
      }
    }
    setClients((items) => items.filter((client) => client.id !== openedClientCard.id));
    setProjects((items) => items.filter((item) => item.clientId !== openedClientCard.id));
    setProjectNamesByClient((items) => {
      const next = { ...items };
      delete next[openedClientCard.id];
      return next;
    });
    if (activeClientId === openedClientCard.id) setActiveClientId('');
    setClientCardId('');
    setConfirmClientDeletion(false);
    setDeletePinInput('');
    if (removedProjectCount) setToast(`Карточка клиента удалена вместе с проектами (${removedProjectCount}).`);
  };

  const copyOrder = async () => {
    await navigator.clipboard.writeText(orderText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  };

  const downloadOrder = () => {
    const blob = new Blob([orderText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `KolorLab-${activeProjectName.replace(/[^\p{L}\p{N}-]+/gu, '-')}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const toggleComparison = (color) => {
    if (comparisonIds.includes(color.id)) {
      setComparisonIds((items) => items.filter((id) => id !== color.id));
      return;
    }
    if (comparisonIds.length >= 6) {
      setToast('В карточке подбора можно собрать до шести оттенков');
      return;
    }
    setComparisonIds((items) => [...items, color.id]);
  };

  const addSelectedToPicker = () => {
    if (comparisonIds.includes(selected.id)) {
      setToast(`${selected.code} уже в карточке подбора`);
      return;
    }
    if (comparisonIds.length >= 6) {
      setToast('Карточка подбора заполнена. Удалите оттенок, чтобы добавить другой.');
      return;
    }
    setComparisonIds((items) => [...items, selected.id]);
    setToast(`${selected.code} добавлен в карточку подбора`);
  };

  const visualizerContent = (isFlat = false) => (
    <div
      className="visualizer relative h-full min-h-[260px]"
      style={{ '--paint': selected.hex, backgroundImage: isFlat ? 'none' : undefined }}
    >
      {!isFlat && <div className={`surface-photo surface-photo-${previewSurface}`}>
        <img src={visualSurfaces.find((item) => item.id === previewSurface)?.image ?? smoothWallImage} alt="" />
        <div className={`surface-photo-tint surface-photo-tint-${previewSurface}`} style={{ backgroundColor: selected.hex }} />
      </div>}
      {!isFlat && <div className={`temperature-overlay ${currentTemperature.className}`} />}
      <div className="comparison-label absolute left-4 top-4 rounded-md px-2.5 py-1.5 text-[10px] font-semibold tracking-wide text-white/85">
        {isFlat ? `ЦИФРОВОЙ HEX · ${selected.hex}` : visualSurfaces.find((item) => item.id === previewSurface)?.label.toUpperCase()}
      </div>
      {!isFlat && <div className="surface-color-chip absolute right-4 top-4 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[10px] font-semibold text-white"><span className="h-2.5 w-2.5 rounded-sm border border-white/50" style={{ backgroundColor: selected.hex }} />ЦВЕТ ПО HEX · {selected.hex}</div>}
      {!isFlat && <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-black/25 px-3 py-2 text-xs text-white/85 backdrop-blur-md"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: currentTemperature.swatch }} />{temperature}K · {currentTemperature.title}</div>}
      {!isFlat && selected.hexEstimated && <div className="absolute bottom-4 right-4 rounded-full bg-black/45 px-3 py-2 text-[10px] font-semibold text-white/85 backdrop-blur-md">Экранный образец · проверьте выкрас</div>}
    </div>
  );

  return (
    <div className="app-shell min-h-screen">
      <header className="topbar sticky top-0 z-20 flex items-center justify-between bg-[#090c11]/90 px-4 backdrop-blur-xl sm:px-7">
        <div className="flex items-center gap-3">
          <img className="header-logo" src={kolorlabLogo} alt="KolorLab — лаборатория цвета" />
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-[#2b323c] bg-[#11151b] px-3 py-1.5 text-[11px] text-slate-400 md:flex"><span className="h-1.5 w-1.5 rounded-full bg-[var(--primary-400)]" />Цифровой подбор цвета <span className="ml-1 text-slate-600">·</span> Москва</div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCatalogOpen(true)} aria-expanded={catalogOpen} className="btn-secondary flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold xl:hidden"><Paintbrush size={15} /><span className="hidden sm:inline">Каталог цветов</span><span className="sm:hidden">Каталог</span></button>
          <button onClick={() => setActiveMobileTab('Краски')} className="btn-secondary hidden items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold xl:flex"><Droplets size={15} /><span>Краски</span></button>
          {apiBaseUrl && <>
            <button onClick={() => { setCatalogManagerType('colors'); setCatalogManagerOpen(true); }} className="btn-secondary flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold"><Paintbrush size={14} /><span className="hidden sm:inline">Цвет</span></button>
            <button onClick={() => { setCatalogManagerType('paints'); setCatalogManagerOpen(true); }} className="btn-secondary flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold"><Droplets size={14} /><span className="hidden sm:inline">Краска</span></button>
          </>}
          <button onClick={() => setDrawerOpen(true)} className="btn-secondary flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold"><ShoppingBag size={15} /><span className="hidden sm:inline">Мой проект</span><span className="accent-solid flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold">{projects.length}</span></button>
        </div>
      </header>

      <main className="dashboard-main mx-auto flex max-w-[1800px] flex-col px-4 pb-24 pt-6 sm:px-7 sm:pt-8">
        <div className="dashboard-intro mb-6 flex flex-wrap items-end justify-between gap-4">
          <div><div className="eyebrow mb-2">ЦИФРОВАЯ ЛАБОРАТОРИЯ ЦВЕТА И КОЛЕРОВКИ</div><h1 className="font-['Manrope'] text-[26px] font-bold tracking-[-.04em] sm:text-[32px]">Найдите свой <span className="text-[var(--primary-300)]">идеальный цвет</span></h1><p className="mt-1.5 text-sm text-slate-500">Подберите оттенок, оцените на поверхности и рассчитайте объём краски.</p></div>
          <button onClick={() => setDrawerOpen(true)} className="hidden items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white sm:flex">Спецификация проекта <ArrowRight size={14} /></button>
        </div>

        <nav className="mobile-tabbar -mx-4 mb-4 flex gap-1 border-y border-[#222831] px-4 py-2 xl:hidden">
          {['Визуализация', 'Расчёт и подбор', 'Краски'].map((tab) => <button key={tab} onClick={() => setActiveMobileTab(tab)} className={`flex-1 rounded-lg py-2 text-[11px] font-semibold ${activeMobileTab === tab ? 'accent-surface text-[var(--primary-100)]' : 'text-slate-500'}`}>{tab}</button>)}
        </nav>

        <div className="dashboard-workspace grid items-stretch gap-5">
          <div className={`dashboard-column ${activeMobileTab !== 'Визуализация' ? 'hidden xl:block' : ''}`}>
            <section className="dashboard-visualizer panel overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#252b33] px-4 py-4 sm:px-5">
                <div><div className="eyebrow">ВИЗУАЛИЗАТОР</div><div className="mt-1 text-sm font-semibold">Посмотрите, как заиграет цвет</div></div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => {
                      if (cameraOpen) setCameraOpen(false);
                      else {
                        setCameraError('');
                        setCameraOpen(true);
                      }
                    }}
                    aria-pressed={cameraOpen}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${cameraOpen ? 'chip active' : 'btn-secondary'}`}
                  >
                    <Camera size={14} />{cameraOpen ? 'Закрыть камеру' : 'Камера'}
                  </button>
                  <button onClick={() => setComparison(!comparison)} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${comparison ? 'chip active' : 'btn-secondary'}`}><ArrowDownUp size={14} />Сравнение</button>
                </div>
              </div>
              {cameraOpen && <section className="camera-panel border-b border-[#252b33] p-4 sm:p-5" aria-label="Сравнение цвета через камеру">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-100">Сравнение через камеру</h2>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-400">Нажмите на участок поверхности в кадре, чтобы снять его цвет.</p>
                  </div>
                  <span className="rounded-full border border-[#343d48] px-2.5 py-1 text-[9px] text-slate-400">Изображение обрабатывается на устройстве</span>
                </div>
                {cameraError && <p role="alert" className="mb-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-100">{cameraError} Нажмите «Камера», чтобы закрыть окно, затем попробуйте снова.</p>}
                {!cameraError && <div className="camera-preview overflow-hidden rounded-xl border border-[#343d48] bg-[#090c11]">
                  <video
                    ref={cameraVideoRef}
                    autoPlay
                    playsInline
                    muted
                    aria-label="Предпросмотр камеры. Нажмите, чтобы выбрать цвет поверхности."
                    role="button"
                    tabIndex={0}
                    onClick={handleCameraSample}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        sampleCameraCenter();
                      }
                    }}
                  />
                  <canvas ref={cameraCanvasRef} className="hidden" aria-hidden="true" />
                </div>}
                <p className="mt-2 text-[10px] leading-relaxed text-slate-500">Для камеры требуется разрешение браузера. Оттенок зависит от освещения и баланса белого; результат служит ориентиром.</p>
                {cameraSample && <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                  <div className="rounded-xl border border-[#303843] bg-[#0c1015] p-3">
                    <div className="eyebrow">СНЯТЫЙ ЦВЕТ</div>
                    <div className="mt-2 flex items-center gap-3">
                      <span className="h-11 w-11 shrink-0 rounded-lg border border-white/15" style={{ backgroundColor: cameraSample.hex }} />
                      <span className="font-mono text-sm font-bold text-slate-100">{cameraSample.hex}</span>
                    </div>
                    <div className="mt-3 border-t border-[#252c34] pt-3">
                      <div className="text-[9px] font-semibold text-slate-500">СРАВНЕНИЕ С ВЫБРАННЫМ ОТТЕНКОМ</div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="h-7 w-7 shrink-0 rounded-md border border-white/10" style={{ backgroundColor: selected.hex }} />
                        <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-slate-200">{selected.code} · {selected.name_ru}</span>
                        <span className="shrink-0 text-[10px] text-slate-400">ΔE {selectedCameraDistance.toFixed(1)}</span>
                      </div>
                      <p className="mt-1 text-[9px] text-slate-500">Ориентировочное сходство: {similarityPercent(selectedCameraDistance)}%</p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#303843] bg-[#0c1015] p-3">
                    <div className="eyebrow mb-2">БЛИЖАЙШИЕ ОТТЕНКИ ИЗ КАТАЛОГА</div>
                    <div className="grid gap-1.5 sm:grid-cols-3 lg:grid-cols-1">
                      {cameraMatches.map(({ color, distance }) => <button key={color.id} onClick={() => selectColor(color)} className="flex min-w-0 items-center gap-2 rounded-lg border border-[#252c34] bg-[#10151b] p-2 text-left transition hover:border-[var(--primary-400)]">
                        <span className="h-8 w-8 shrink-0 rounded-md border border-white/10" style={{ backgroundColor: color.hex }} />
                        <span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-bold text-slate-200">{color.code} · {color.name_ru}</span><span className="block text-[9px] text-slate-500">ΔE {distance.toFixed(1)} · сходство {similarityPercent(distance)}%</span></span>
                        <ArrowRight size={13} className="shrink-0 text-slate-500" />
                      </button>)}
                    </div>
                  </div>
                </div>}
              </section>}
              <div className={`grid ${comparison ? 'md:grid-cols-2' : 'grid-cols-1'} gap-px bg-[#252b33] lg:flex-1`}>
                {comparison && <div className="min-h-[270px]">{visualizerContent(true)}</div>}
                <div className="min-h-[270px]">{visualizerContent(false)}</div>
              </div>
              <section className="grid gap-4 border-t border-[#252b33] bg-[#0c1015] p-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] sm:px-5" aria-label="Настройки предпросмотра визуализации">
                <div>
                  <div className="eyebrow mb-2">ПОВЕРХНОСТЬ ПРЕДПРОСМОТРА</div>
                  <div className="flex flex-wrap gap-1.5">
                    {visualSurfaces.filter((item) => !selectedPaintProduct || selectedPaintProduct.surfaces.includes(item.calculatorSurface)).map((item) => {
                      const Icon = item.icon;
                      return <button key={item.id} onClick={() => { setPreviewSurface(item.id); setSurface(item.calculatorSurface); }} className={`chip flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[10px] font-semibold ${previewSurface === item.id ? 'active' : ''}`}><Icon size={12} />{item.label}</button>;
                    })}
                  </div>
                  {previewSurface === 'wallpaper' && <p className="mt-1.5 text-[9px] leading-relaxed text-amber-200/70">Для расчёта обои оцениваются как гладкая стена; расход зависит от фактуры.</p>}
                </div>
                <div>
                  <div className="eyebrow mb-2">ЦВЕТОВАЯ ТЕМПЕРАТУРА · {currentTemperature.title}</div>
                  <div className="flex gap-1.5">{temperatures.map((item) => <button key={item.value} onClick={() => setTemperature(item.value)} aria-pressed={temperature === item.value} title={item.title} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[10px] font-semibold transition ${temperature === item.value ? 'accent-selection' : 'border-[#2b323c] bg-[#14191f] text-slate-500 hover:text-slate-300'}`}><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.swatch }} />{item.value}K</button>)}</div>
                </div>
              </section>
            </section>

          </div>

          <div className={`dashboard-column dashboard-column-center ${activeMobileTab === 'Краски' ? 'dashboard-paint-view' : ''} ${!['Расчёт и подбор', 'Краски'].includes(activeMobileTab) ? 'hidden xl:flex' : ''}`}>
            <section className={`dashboard-calculator panel p-4 sm:p-5 ${activeMobileTab === 'Краски' ? 'hidden' : ''}`}>
              <div className="mb-4 flex items-start justify-between"><div><div className="eyebrow">РАСЧЁТ КРАСКИ</div><h2 className="mt-1 text-sm font-semibold">Сколько понадобится?</h2></div><div className="rounded-lg bg-[#1a2027] p-2 text-[var(--primary-300)]"><Droplets size={16} /></div></div>
              <div className="mb-4 flex items-end justify-between"><label htmlFor="area" className="text-xs text-slate-400">Площадь окрашивания</label><div className="text-right"><span className="font-['Manrope'] text-xl font-bold">{area}</span><span className="ml-1 text-xs text-slate-500">м²</span></div></div>
              <input id="area" type="range" min="5" max="150" value={area} onChange={(event) => setArea(Number(event.target.value))} style={{ '--range-progress': `${((area - 5) / 145) * 100}%` }} className="range-slider mb-1 w-full" />
              <div className="mb-5 flex justify-between text-[10px] text-slate-600"><span>5 м²</span><span>150 м²</span></div>
              <div className="mb-4 grid grid-cols-2 gap-3">
                <div><label className="mb-2 block text-[10px] font-semibold text-slate-500">КОЛИЧЕСТВО СЛОЁВ</label><div className="flex rounded-lg border border-[#2b323c] bg-[#0b0f14] p-1">{[1, 2, 3].map((count) => <button key={count} onClick={() => setLayers(count)} className={`flex-1 rounded-md py-1.5 text-xs font-semibold ${layers === count ? 'accent-solid rounded-md' : 'text-slate-500 hover:text-slate-300'}`}>{count}</button>)}</div></div>
                <div>
                  <label className="mb-2 block text-[10px] font-semibold text-slate-500">ПОВЕРХНОСТЬ</label>
                  <div className="relative"><select value={surface} onChange={(event) => setSurface(event.target.value)} className="field w-full appearance-none rounded-lg px-2.5 py-2 text-[11px]">{surfaces.filter((item) => !selectedPaintProduct || selectedPaintProduct.surfaces.includes(item.id)).map((item) => <option key={item.id} value={item.id}>{item.label} · {item.rate} м²/л</option>)}</select><ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-2.5 text-slate-500" /></div>
                </div>
              </div>
              <section className="mb-3 rounded-xl border border-[#2a313a] bg-[#0d1117] p-3" aria-label="Каталог лакокрасочных материалов">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="paint-product" className="text-[10px] font-semibold text-slate-500">КАТАЛОГ ЛАКОКРАСОЧНЫХ МАТЕРИАЛОВ</label>
                </div>
                <div className="relative">
                  <select id="paint-product" value={paintProductId} onChange={(event) => {
                    const productId = event.target.value;
                    const product = availablePaintProductsById.get(productId);
                    setPaintProductId(productId);
                    if (product) {
                      if (!product.surfaces.includes(surface)) setSurface(product.surfaces[0]);
                      const preview = visualSurfaces.find((item) => item.id === previewSurface);
                      if (!preview || !product.surfaces.includes(preview.calculatorSurface)) {
                        const nextPreview = visualSurfaces.find((item) => product.surfaces.includes(item.calculatorSurface));
                        if (nextPreview) {
                          setPreviewSurface(nextPreview.id);
                          setSurface(nextPreview.calculatorSurface);
                        }
                      }
                    }
                  }} className="field w-full appearance-none rounded-lg px-2.5 py-2 pr-8 text-[11px]">
                    <option value="">Не выбрана — общий расчёт расхода</option>
                    {[...new Set(availablePaintProducts.map((product) => product.brand))].map((brand) => <optgroup key={brand} label={brand}>
                      {availablePaintProducts.filter((product) => product.brand === brand).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                    </optgroup>)}
                  </select>
                  <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-2.5 text-slate-500" />
                </div>
                {selectedPaintProduct && <div className="mt-3 space-y-2 border-t border-[#252b33] pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-100">{selectedPaintProduct.brand} · {selectedPaintProduct.name}</span>
                    <span className="rounded-full border border-[#343d48] px-2 py-0.5 text-[9px] text-slate-400">{selectedPaintProduct.finish}</span>
                  </div>
                  <p className="text-[10px] leading-relaxed text-slate-400">{selectedPaintProduct.purpose}</p>
                  {selectedPaintProduct.availabilityNote && <p className="rounded-md border border-amber-500/20 bg-amber-500/5 px-2 py-1.5 text-[10px] leading-relaxed text-amber-200/80">{selectedPaintProduct.availabilityNote}</p>}
                  <div className="grid gap-1 text-[10px] text-slate-400 sm:grid-cols-2">
                    <span><strong className="text-slate-300">Расход:</strong> {selectedPaintProduct.coverageDescription}</span>
                    <span><strong className="text-slate-300">Базы продукта:</strong> {selectedPaintBaseSystem}</span>
                    <span><strong className="text-slate-300">Фасовки:</strong> {selectedPaintPackageSizes ? selectedPaintPackageSizes.map((size) => `${size.toLocaleString('ru-RU')} ${quantityUnit}`).join(', ') : 'не подтверждены; уточнить у продавца'}</span>
                    <span><strong className="text-slate-300">Цена:</strong> {Number.isFinite(paintPricePerLiter) ? `${paintPricePerLiter.toLocaleString('ru-RU')} ₽/${quantityUnit}` : 'не указана'}</span>
                  </div>
                  <label className="flex items-center gap-2 text-[10px] text-slate-500">
                    <span className="shrink-0">Ваша цена, ₽/{quantityUnit}</span>
                    <input type="number" min="0" step="0.01" value={Number.isFinite(paintPricePerLiter) ? paintPricePerLiter : ''} onBlur={savePaintPriceToGithub} onChange={(event) => {
                      const value = event.target.value;
                      setPaintPricesByProduct((prices) => {
                        const next = { ...prices };
                        if (value === '') delete next[paintProductId];
                        else if (Number.isFinite(Number(value)) && Number(value) >= 0) next[paintProductId] = Number(value);
                        return next;
                      });
                    }} placeholder="Добавить позже" className="field min-w-0 flex-1 rounded-md px-2 py-1.5 text-[10px]" />
                  </label>
                  {paintCoverage
                    ? <p className="text-[10px] text-slate-500">Расход для этой поверхности: {minimumLiters.toFixed(1).replace('.', ',')}–{liters.toFixed(1).replace('.', ',')} {quantityUnit} на {layers} сл.</p>
                    : <p className="text-[10px] leading-relaxed text-amber-200/70">Нет отдельного расхода по выбранной поверхности; объём ниже рассчитан по общему ориентиру. Сверьте технический лист.</p>}
                  {selectedPaintProduct.source && <a href={selectedPaintProduct.source} target="_blank" rel="noreferrer" className="inline-block text-[10px] text-[var(--primary-300)] underline decoration-[var(--primary-300)]/30 underline-offset-2 hover:decoration-[var(--primary-300)]">Данные производителя</a>}
                  {selectedPaintProduct.custom && <span className="text-[10px] text-slate-500">Пользовательская запись · расход и фасовка заданы вручную</span>}
                </div>}
              </section>
              <div className="rounded-xl border border-[#303c2c] bg-[#141a14] p-3.5">
                <div className="flex items-center justify-between"><span className="text-xs text-slate-400">Необходимый объём</span><span className="font-['Manrope'] text-lg font-bold text-[var(--primary-100)]">{paintCoverage ? `${minimumLiters.toFixed(1).replace('.', ',')}–` : ''}{liters.toFixed(1).replace('.', ',')} {quantityUnit}</span></div>
                <div className="mt-2 flex items-start gap-2 border-t border-[#2b3527] pt-2.5"><ShoppingBag size={13} className="mt-0.5 shrink-0 text-slate-500" /><span className="text-[11px] leading-5 text-slate-400">{cans} <span className="text-slate-600">·</span> {selectedPaintProduct ? selectedPaintProduct.baseSystem : <span className={currentBase === 'C' ? 'base-warning' : 'text-sky-300'}>База {currentBase}</span>}</span></div>
                {Number.isFinite(paintPricePerLiter) && <div className="mt-2 border-t border-[#2b3527] pt-2 text-right text-[11px] text-slate-300">Ориентировочная стоимость: {(liters * paintPricePerLiter).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽</div>}
              </div>
              {selected.hexEstimated && <p className="mt-1 text-[10px] leading-relaxed text-slate-500">Экранный образец приблизительный. Перед покупкой сверьте его с веером.</p>}
              {currentBase === 'C' && <div className="base-warning-surface mt-3 flex items-center gap-2 rounded-lg border px-3 py-2.5 text-[11px]"><Lightbulb size={14} className="shrink-0" />{selectedPaintProduct && !selectedPaintProduct.tintBases?.includes('C') ? 'По каталогу оттенку нужна База C, но совместимость с системой выбранной краски не подтверждена. Уточните у производителя.' : 'Требуется прозрачная База С для оттенка. Сверьте совместимость с системой краски.'}</div>}
              <div className="mt-4">
                <label htmlFor="project-name" className="mb-2 block text-[10px] font-semibold text-slate-500">ПРОЕКТ</label>
                <div className="relative"><select id="project-name" value={activeProjectName} onChange={(event) => setActiveProjectName(event.target.value)} className="field w-full appearance-none rounded-lg px-3 py-2.5 pr-8 text-xs">{projectNames.map((name) => <option key={name} value={name}>{name}</option>)}</select><ChevronDown size={13} className="pointer-events-none absolute right-3 top-3 text-slate-500" /></div>
              </div>
              <div className="mt-4">
                <label htmlFor="project-client" className="mb-2 block text-[10px] font-semibold text-slate-500">КЛИЕНТ ПРОЕКТА</label>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <div className="relative">
                    <select id="project-client" value={activeClientId} onChange={(event) => setActiveClientId(event.target.value)} className="field w-full appearance-none rounded-lg px-3 py-2.5 pr-8 text-xs">
                      <option value="">Выберите клиента</option>
                      {visibleClients.map((client) => <option key={client.id} value={client.id}>{client.name}{client.phoneLast4 ? ` · •••• ${client.phoneLast4}` : ''}</option>)}
                    </select>
                    <ChevronDown size={13} className="pointer-events-none absolute right-3 top-3 text-slate-500" />
                  </div>
                  <button onClick={() => setDrawerOpen(true)} className="btn-secondary flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold"><UserRound size={14} />Клиенты</button>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                <div className="relative"><select value={zone} onChange={(event) => setZone(event.target.value)} aria-label="Зона проекта" className="field h-full w-full appearance-none rounded-lg px-3 py-2.5 pr-8 text-xs">{zones.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={13} className="pointer-events-none absolute right-3 top-3 text-slate-500" /></div>
                <button onClick={addToProject} className="btn-primary flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-bold"><Plus size={15} />В проект</button>
              </div>
            </section>
            <section className={`dashboard-palettes panel min-h-0 p-4 sm:p-5 ${activeMobileTab === 'Краски' ? 'hidden' : activeMobileTab !== 'Расчёт и подбор' ? 'hidden xl:flex' : ''}`} aria-label="Карточка подбора цветов">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="eyebrow">ВАША КОЛЛЕКЦИЯ</div>
                  <h2 className="mt-1 font-['Manrope'] text-base font-bold">Карточка подбора</h2>
                  <p className="mt-1 text-xs text-slate-500">Соберите до шести оттенков из каталога.</p>
                </div>
                <span className="accent-surface rounded-full px-2.5 py-1 text-[10px] font-bold text-[var(--primary-200)]">{comparisonIds.length}/6</span>
              </div>
              <div className="mb-2 text-[9px] font-semibold uppercase tracking-wide text-slate-500">Сравнение на {visualSurfaces.find((item) => item.id === previewSurface)?.label.toLocaleLowerCase('ru')} · {temperature}K</div>
              <div className="grid grid-cols-3 gap-2" aria-label="Выбранные оттенки">
                {Array.from({ length: 6 }, (_, index) => {
                  const color = comparedColors[index];
                  return color
                    ? <article key={color.id} className="group relative min-w-0 overflow-hidden rounded-lg border border-[#303843] bg-[#0c1015]">
                      <button onClick={() => selectColor(color)} className="comparison-swatch relative h-14 w-full overflow-hidden text-left" aria-label={`Показать ${color.code} в визуализаторе`}>
                      <span className={`surface-photo surface-photo-${previewSurface}`}>
                        <img src={visualSurfaces.find((item) => item.id === previewSurface)?.image ?? smoothWallImage} alt="" />
                        <span className={`surface-photo-tint surface-photo-tint-${previewSurface}`} style={{ backgroundColor: color.hex }} />
                      </span>
                      <span className={`temperature-overlay ${currentTemperature.className}`} />
                        <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-1 text-[9px] font-bold text-white">{color.hex}</span>
                      </button>
                      <button onClick={() => toggleComparison(color)} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-md bg-black/50 text-white/80 opacity-100 transition hover:bg-black/75 sm:opacity-0 sm:group-hover:opacity-100" aria-label={`Убрать ${color.code} из подбора`}><X size={13} /></button>
                      <div className="truncate px-1.5 py-1.5 text-[9px] font-semibold text-slate-300" title={`${color.code} · ${color.name_ru} · LRV ${color.lrv}%`}>{color.code} · LRV {color.lrv}%</div>
                    </article>
                    : <div key={`empty-${index}`} className="flex min-h-[72px] flex-col items-center justify-center rounded-lg border border-dashed border-[#303843] bg-[#0c1015]/60 text-slate-600">
                      <Plus size={14} />
                      <span className="mt-1 text-[9px]">Оттенок {index + 1}</span>
                    </div>;
                })}
              </div>
              <button onClick={addSelectedToPicker} disabled={comparisonIds.length >= 6 || comparisonIds.includes(selected.id)} className="btn-primary mt-3 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50">
                <Plus size={14} />{comparisonIds.includes(selected.id) ? 'Текущий оттенок уже добавлен' : 'Добавить выбранный оттенок'}
              </button>
              <div className="mt-3 rounded-xl border border-[#2a313a] bg-[#0c1015] p-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-300"><GitCompareArrows size={14} className="text-[var(--primary-300)]" />Рекомендации к {selected.code}</div>
                <div className="grid gap-1.5">
                  {recommendations.map(({ type, description, color }) => <button key={type} onClick={() => toggleComparison(color)} disabled={comparisonIds.includes(color.id) || comparisonIds.length >= 6} className="flex min-w-0 items-center gap-2 rounded-lg border border-[#252c34] bg-[#10151b] p-1.5 text-left transition hover:border-[#414c59] disabled:cursor-not-allowed disabled:opacity-45">
                    <span className="h-7 w-8 shrink-0 rounded-md border border-white/10" style={{ backgroundColor: color.hex }} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-[9px] font-bold text-slate-200">{type} · {color.code}</span><span className="block truncate text-[8px] text-slate-500">{description} · {color.name_ru}</span></span>
                    <Plus size={13} className="shrink-0 text-[var(--primary-300)]" />
                  </button>)}
                  {!recommendations.length && <p className="text-[9px] text-slate-500">Для этого оттенка пока нет подходящих сочетаний.</p>}
                </div>
              </div>
            </section>
            {activeMobileTab === 'Краски' && <PaintCatalogPanel
              products={availablePaintProducts}
              selectedId={paintProductId}
              onSelect={(product) => {
                setPaintProductId(product.id);
                if (!product.surfaces.includes(surface)) setSurface(product.surfaces[0]);
                const preview = visualSurfaces.find((item) => item.id === previewSurface);
                if (!preview || !product.surfaces.includes(preview.calculatorSurface)) {
                  const nextPreview = visualSurfaces.find((item) => product.surfaces.includes(item.calculatorSurface));
                  if (nextPreview) {
                    setPreviewSurface(nextPreview.id);
                    setSurface(nextPreview.calculatorSurface);
                  }
                }
              }}
              onManage={() => { setCatalogManagerType('paints'); setCatalogManagerOpen(true); }}
            />}
          </div>
        </div>

        <div className={`catalog-drawer-overlay fixed inset-0 z-40 flex justify-end ${catalogOpen ? 'catalog-is-open' : ''}`}>
        <button aria-label="Закрыть каталог цветов" onClick={closeCatalog} className="drawer-backdrop absolute inset-0" />
        <section ref={catalogPanelRef} onScroll={handleCatalogScroll} role={catalogOpen ? 'dialog' : 'region'} aria-modal={catalogOpen || undefined} aria-label="Каталог оттенков" className="catalog-drawer-panel drawer relative flex h-full w-full max-w-[1100px] flex-col overflow-y-auto border-l border-[#29303a] bg-[#10141a] p-4 pb-24 sm:p-5 sm:pb-24">
          <div className="catalog-drawer-header flex shrink-0 items-start justify-between gap-4 border-b border-[#252b33] pb-4">
            <div className="min-w-0">
              <div className="eyebrow">КАТАЛОГ ОТТЕНКОВ</div>
              <h2 className="mt-1 font-['Manrope'] text-xl font-bold">Выберите цвет</h2>
              <p className="mt-1 text-xs text-slate-500">Образцы цвета в масштабе · {filteredColors.length} оттенков. Удерживайте карточку, чтобы увидеть аналоги.</p>
              <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-500 sm:hidden"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-300" />База A</span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-300" />База C</span></div>
            </div>
            <div className="flex shrink-0 items-start gap-3">
              <div className="hidden items-center gap-2 text-[10px] text-slate-500 sm:flex"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-300" />База A</span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-300" />База C</span></div>
              {apiBaseUrl && <button onClick={() => { setCatalogManagerType('colors'); setCatalogManagerOpen(true); }} className="btn-secondary flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[10px] font-semibold sm:px-3 sm:text-xs"><ShieldCheck size={14} /><span>Управлять цветами</span></button>}
              <button aria-label="Закрыть каталог цветов" onClick={closeCatalog} className="catalog-close-button icon-button h-9 shrink-0 rounded-lg px-2 text-slate-400"><span className="catalog-close-label">Закрыть каталог</span><X size={18} className="catalog-close-icon" /></button>
            </div>
          </div>
          <input ref={customCatalogFileRef} type="file" accept=".json,application/json" className="hidden" aria-label="Выбрать файл базы KolorLab" onChange={importCustomCatalog} />
          <div className="my-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#2a313a] bg-[#0c1015] px-3 py-2.5">
            <div className="text-[10px] text-slate-400">
              Ваша база: <strong className="text-slate-200">{customColors.length} цветов</strong> · <strong className="text-slate-200">{customPaintProducts.length} красок</strong>
              <span className="hidden text-slate-500 sm:inline"> · общая база автоматически синхронизируется с GitHub</span>
            </div>
            {apiUser?.isAdmin && <div className="flex items-center gap-1.5">
              <button onClick={exportCustomCatalog} className="btn-secondary flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[10px] font-semibold sm:px-3"><FileDown size={13} />Сохранить базу</button>
              <button onClick={() => customCatalogFileRef.current?.click()} className="btn-secondary flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[10px] font-semibold sm:px-3"><FileUp size={13} />Загрузить базу</button>
            </div>}
          </div>
          <div className="catalog-controls shrink-0">
          <div className="relative mb-3"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск по коду, каталогу или названию оттенка..." className="field w-full rounded-lg py-2.5 pl-9 pr-3 text-xs" /></div>
          <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">{catalogFilters.map((item) => <button key={item.label} onClick={() => setCatalog(item.catalog)} className={`chip shrink-0 rounded-md px-2.5 py-1.5 text-[10px] font-medium ${catalog === item.catalog ? 'active' : ''}`}>{item.label}</button>)}</div>
          <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin" aria-label="Фильтр по базе колеровки">{['Все базы', 'A', 'C'].map((base) => { const label = base === 'Все базы' ? base : `База ${base} (${base === 'A' ? 'Белая' : 'Прозрачная'})`; return <button key={base} onClick={() => setBaseFilter(base)} className={`chip shrink-0 rounded-md px-2.5 py-1.5 text-[10px] font-medium ${baseFilter === base ? 'active' : ''}`}>{label}</button>; })}</div>
          <div className="mb-3 grid grid-cols-2 gap-2" aria-label="Фильтры по семейству и светлоте">
            <select aria-label="Семейство цвета" value={familyFilter} onChange={(event) => setFamilyFilter(event.target.value)} className="field min-w-0 rounded-lg px-2 py-2 text-[10px]">{colorFamilies.map((family) => <option key={family}>{family}</option>)}</select>
            <select aria-label="Светлота цвета" value={lightnessFilter} onChange={(event) => setLightnessFilter(event.target.value)} className="field min-w-0 rounded-lg px-2 py-2 text-[10px]">{lightnessFilters.map((filter) => <option key={filter}>{filter}</option>)}</select>
          </div>
          <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin" aria-label="Фильтр по области применения">{applicationFilters.map((item) => <button key={item.id} onClick={() => setApplicationFilter(item.id)} className={`chip shrink-0 rounded-md px-2.5 py-1.5 text-[10px] font-medium ${applicationFilter === item.id ? 'active' : ''}`}>{item.label}</button>)}</div>
          </div>
          <div className="catalog-results min-h-0 flex-none pr-1">
          {filteredColors.length > 0 && <div>
            <div className="catalog-swatch-grid grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5 min-[1900px]:grid-cols-6">
            {visibleColors.map((color) => {
              const selectedCard = selectedId === color.id;
              const comparisonSelected = comparisonIds.includes(color.id);
              const lightSwatch = color.lrv >= 50 || color.base === 'A';
              const ink = lightSwatch ? '#1e293b' : '#f8fafc';
              const catalogLabel = getCatalogLabel(color.catalog);
              const applications = color.applications ?? [];
              return <div key={color.id} className="swatch-card-item min-w-0">
                <button
                  onClick={() => {
                    if (suppressCardClickRef.current) {
                      suppressCardClickRef.current = false;
                      return;
                    }
                    selectColor(color);
                  }}
                  onPointerDown={(event) => startCardHold(event, color)}
                  onPointerUp={endCardHold}
                  onPointerLeave={cancelCardHold}
                  onPointerCancel={cancelCardHold}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    showAnalogMenu(color, event.currentTarget);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                      event.preventDefault();
                      showAnalogMenu(color, event.currentTarget);
                    }
                  }}
                  aria-pressed={selectedCard}
                  aria-label={`${color.code}, ${color.name_ru}${color.hexEstimated ? '. Экранный цвет приблизительный.' : ''}. Удерживайте для аналогов из других каталогов.`}
                  title={color.hexEstimated ? 'Экранный образец приблизительный — сделайте пробный выкрас' : undefined}
                  className={`swatch-card group relative flex h-[122px] w-full flex-col justify-between overflow-hidden rounded-xl p-3 text-left sm:p-3.5 ${selectedCard ? 'swatch-card-selected' : ''}`}
                  style={{ backgroundColor: color.hex, color: ink, '--swatch-ink': ink }}
                >
                  <span className="pointer-events-none absolute inset-0 rounded-[inherit] border border-white/20" aria-hidden="true" />
                  <span className="pointer-events-none absolute inset-0 rounded-[inherit] border border-black/[.06]" aria-hidden="true" />
                  <span className="relative z-[1] flex w-full items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block break-words text-base font-extrabold leading-tight tracking-[-.03em]">{color.code}</span>
                      <span className="mt-0.5 block truncate text-xs font-medium opacity-85">{color.name_ru}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <span className="swatch-catalog-label max-w-[128px] truncate">{catalogLabel}</span>
                      {selectedCard && <span className="accent-solid flex h-6 w-6 items-center justify-center rounded-full shadow-md"><Check size={14} strokeWidth={3} /></span>}
                    </span>
                  </span>
                  <span className="relative z-[1] flex items-center gap-1.5 overflow-hidden">
                    {applications.length ? applications.map((application) => <span key={application} className="truncate rounded-full border border-current/20 bg-black/[.06] px-1.5 py-0.5 text-[8px] font-semibold leading-none">{application}</span>) : <span className="text-[8px] opacity-70">Применение не указано</span>}
                  </span>
                  <span className="relative z-[1] mt-1 flex items-end justify-between gap-2 border-t border-current/15 pt-1.5">
                    <span className="text-[10px] font-semibold tracking-wide opacity-75">{color.hexEstimated ? 'ОБРАЗЕЦ ≈' : `LRV ${color.lrvEstimated ? '≈' : ''}${color.lrv}%`}</span>
                    <span className="rounded-full border border-current/20 bg-black/[.07] px-2 py-0.5 text-[9px] font-bold">База {color.base}</span>
                  </span>
                </button>
                <div className="mt-1.5 flex gap-1.5">
                  <button onClick={() => toggleComparison(color)} aria-pressed={comparisonSelected} className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[9px] font-semibold transition ${comparisonSelected ? 'accent-selection' : 'border-[#252c34] bg-[#10151b] text-slate-500 hover:border-[#414c59] hover:text-slate-300'}`}>
                    {comparisonSelected ? <Check size={11} /> : <Plus size={11} />}{comparisonSelected ? 'Добавлено' : 'Добавить'}
                  </button>
                  <button onClick={() => setExpandedColor(color)} aria-label={`Развернуть ${color.code} на весь экран`} title="На весь экран" className="flex h-7 w-8 shrink-0 items-center justify-center rounded-md border border-[#343d48] bg-[#10151b] text-slate-400 transition hover:border-[var(--primary-400)] hover:text-[var(--primary-200)]"><Expand size={14} /></button>
                </div>
              </div>;
            })}
            </div>
            {analogMenu && createPortal(<div
              ref={analogMenuRef}
              role="dialog"
              aria-label={`Аналогичные оттенки для ${analogMenu.source.code}`}
              className="fixed z-[70] overflow-hidden rounded-xl border border-[#343d48] bg-[#11161d]/[.98] shadow-2xl shadow-black/60 backdrop-blur-xl"
              style={analogMenu.style}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 border-b border-[#29313b] px-3.5 py-3">
                <div className="min-w-0">
                  <div className="eyebrow">ПОХОЖИЕ ИЗ ДРУГИХ КАТАЛОГОВ</div>
                  <div className="mt-1 truncate text-xs font-semibold text-slate-100">{analogMenu.source.code} · {analogMenu.source.name_ru}</div>
                </div>
                <button onClick={() => setAnalogMenu(null)} className="icon-button h-6 w-6 shrink-0 rounded-md text-slate-500 hover:text-white" aria-label="Закрыть аналоги"><X size={14} /></button>
              </div>
              <div className="max-h-[270px] space-y-1.5 overflow-y-auto p-2 scrollbar-thin">
                {analogMenu.alternatives.map(({ color, distance }) => {
                  const catalogLabel = getCatalogLabel(color.catalog);
                  return <button
                    key={color.id}
                    role="menuitem"
                    onClick={() => {
                      selectColor(color);
                      setSearch('');
                      setBaseFilter('Все базы');
                      setCatalog(color.catalog);
                      setAnalogMenu(null);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg border border-transparent p-2 text-left transition hover:border-[#38434e] hover:bg-[#1b222a]"
                  >
                    <span className="h-9 w-9 shrink-0 rounded-md border border-white/10 shadow-inner" style={{ backgroundColor: color.hex }} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[11px] font-bold text-slate-100">{color.code}</span>
                        <span className="truncate rounded-full bg-[#252c35] px-1.5 py-0.5 text-[9px] text-slate-400">{catalogLabel}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] text-slate-400">{color.name_ru}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[10px] font-bold text-[var(--primary-300)]">{similarityPercent(distance)}%</span>
                      <span className="block text-[9px] text-slate-600">сходство</span>
                    </span>
                  </button>;
                })}
              </div>
              <div className="border-t border-[#29313b] px-3.5 py-2 text-[9px] text-slate-600">Оттенки отсортированы по близости цвета (CIE76)</div>
            </div>, document.body)}
            {visibleCount < filteredColors.length && <div ref={loadMoreRef} className="mt-5 flex min-h-12 items-center justify-center">
              <button onClick={() => setVisibleCount((count) => Math.min(count + 24, filteredColors.length))} className="btn-secondary rounded-lg px-4 py-2.5 text-xs font-semibold">
                Показать ещё {Math.min(24, filteredColors.length - visibleCount)} · {visibleCount} из {filteredColors.length}
              </button>
            </div>}
          </div>}
          {filteredColors.length === 0 && <div className="rounded-xl border border-dashed border-[#343b45] px-4 py-14 text-center text-sm text-slate-500">Подходящие цвета не найдены. Измените фильтры или запрос.</div>}
          </div>
        </section>
        {catalogShowTop && <div className="catalog-to-top-dock fixed z-[45] border-t border-[#343d48] bg-[#10141a]/95 px-4 pt-3 shadow-[0_-12px_36px_rgba(0,0,0,.38)] backdrop-blur-xl sm:px-5" style={{ left: `${catalogDock.left}px`, width: `${catalogDock.width}px`, bottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <div className="mx-auto flex w-full max-w-[1100px] justify-end pb-3">
            <button onClick={scrollCatalogToTop} aria-label="Вверх каталога" className="btn-secondary flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold shadow-lg transition hover:border-[var(--primary-400)] hover:text-[var(--primary-100)]"><ArrowDown size={14} className="rotate-180" />Вверх</button>
          </div>
        </div>}
        </div>
      </main>

      {customEntryType && <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/65 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCatalogEntryForm(); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="custom-entry-title" className="panel my-auto max-h-[calc(100dvh-24px)] w-full max-w-xl overflow-y-auto p-4 shadow-2xl sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <div className="eyebrow">{editingCatalogEntry ? 'РЕДАКТИРОВАНИЕ · ОБЩАЯ БАЗА' : 'НОВАЯ ЗАПИСЬ · ОБЩАЯ БАЗА'}</div>
              <h2 id="custom-entry-title" className="mt-1 font-['Manrope'] text-lg font-bold">{customEntryType === 'color' ? `${editingCatalogEntry ? 'Редактировать' : 'Добавить'} цвет` : `${editingCatalogEntry ? 'Редактировать' : 'Добавить'} краску`}</h2>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">После сохранения запись сразу обновится в общей базе приватного GitHub.</p>
            </div>
            <button type="button" onClick={closeCatalogEntryForm} aria-label="Закрыть форму" className="icon-button h-9 w-9 shrink-0 rounded-lg text-slate-400"><X size={17} /></button>
          </div>
          {customEntryType === 'color' ? <form onSubmit={addCustomColor} className="space-y-4">
            <label className="block text-[10px] font-semibold text-slate-400">Код / ваш артикул
              <input autoFocus required maxLength={40} value={customColorDraft.code} onChange={(event) => setCustomColorDraft((draft) => ({ ...draft, code: event.target.value }))} placeholder="Например, Дизайн 01" className="field mt-1.5 w-full rounded-lg px-3 py-2.5 text-xs" />
            </label>
            <label className="block text-[10px] font-semibold text-slate-400">Название оттенка
              <input required maxLength={80} value={customColorDraft.name} onChange={(event) => setCustomColorDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="Например, Туманное утро" className="field mt-1.5 w-full rounded-lg px-3 py-2.5 text-xs" />
            </label>
            <div className="grid grid-cols-[auto_1fr] items-end gap-3">
              <label className="block text-[10px] font-semibold text-slate-400">Образец<input type="color" value={customColorDraft.hex} onChange={(event) => setCustomColorDraft((draft) => ({ ...draft, hex: event.target.value.toUpperCase() }))} aria-label="Выбрать цвет" className="mt-1.5 block h-10 w-14 cursor-pointer rounded-lg border border-[#343d48] bg-[#0c1015] p-1" /></label>
              <label className="block text-[10px] font-semibold text-slate-400">HEX-код
                <input required pattern="#[0-9a-fA-F]{6}" maxLength={7} value={customColorDraft.hex} onChange={(event) => setCustomColorDraft((draft) => ({ ...draft, hex: event.target.value.toUpperCase() }))} className="field mt-1.5 w-full rounded-lg px-3 py-2.5 font-mono text-xs uppercase" />
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#2a313a] bg-[#0c1015] px-3 py-2.5">
              <span className="text-[10px] text-slate-400">База рассчитывается автоматически по HEX</span>
              <BaseBadge base={getTintingBase(customColorDraft.hex, estimateLrvFromHex(customColorDraft.hex))} />
            </div>
            <div className="flex justify-end gap-2 border-t border-[#252b33] pt-4">
              <button type="button" onClick={closeCatalogEntryForm} className="btn-secondary rounded-lg px-4 py-2.5 text-xs font-semibold">Отмена</button>
              <button type="submit" disabled={Boolean(catalogSavingId)} className="btn-primary flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold disabled:opacity-50"><Plus size={14} />{editingCatalogEntry ? 'Сохранить изменения' : 'Сохранить цвет'}</button>
            </div>
          </form> : <form onSubmit={addCustomPaintProduct} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-[10px] font-semibold text-slate-400">Бренд / производитель
                <input autoFocus name="brand" required maxLength={60} value={customPaintDraft.brand} onChange={(event) => setCustomPaintDraft((draft) => ({ ...draft, brand: event.target.value }))} placeholder="Например, Моя мастерская" className="field mt-1.5 w-full rounded-lg px-3 py-2.5 text-xs" />
              </label>
              <label className="block text-[10px] font-semibold text-slate-400">Название краски
                <input name="name" required maxLength={80} value={customPaintDraft.name} onChange={(event) => setCustomPaintDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="Название продукта" className="field mt-1.5 w-full rounded-lg px-3 py-2.5 text-xs" />
              </label>
            </div>
            <label className="block text-[10px] font-semibold text-slate-400">Тип краски
              <select value={customPaintDraft.category} onChange={(event) => setCustomPaintDraft((draft) => ({
                ...draft,
                category: event.target.value,
                packages: event.target.value === 'plaster' ? '5, 15, 25' : '0.9, 2.7, 9',
                surfaces: event.target.value === 'plaster' ? ['plaster'] : event.target.value === 'facade' ? ['facade'] : ['wall', 'plaster'],
              }))} className="field mt-1.5 w-full rounded-lg px-3 py-2.5 text-xs">
                {paintCategories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
              </select>
            </label>
            <fieldset>
              <legend className="mb-2 text-[10px] font-semibold text-slate-400">Область применения</legend>
              <div className="flex flex-wrap gap-2">{paintApplications.map((item) => <label key={item.id} className="flex items-center gap-1.5 rounded-lg border border-[#2b323c] bg-[#0c1015] px-2.5 py-2 text-[10px] text-slate-300">
                <input type="checkbox" checked={customPaintDraft.applications.includes(item.id)} onChange={(event) => setCustomPaintDraft((draft) => ({ ...draft, applications: event.target.checked ? [...new Set([...draft.applications, item.id])] : draft.applications.filter((id) => id !== item.id) }))} className="accent-[var(--primary-400)]" />
                {item.label}
              </label>)}</div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-[10px] font-semibold text-slate-400">Колеровка</legend>
              <select aria-label="Колеруется ли краска" value={customPaintDraft.tintable === true ? 'yes' : customPaintDraft.tintable === false ? 'no' : 'unknown'} onChange={(event) => setCustomPaintDraft((draft) => ({ ...draft, tintable: event.target.value === 'yes' ? true : event.target.value === 'no' ? false : null, tintBases: event.target.value === 'no' ? [] : draft.tintBases }))} className="field w-full rounded-lg px-3 py-2.5 text-xs">
                <option value="unknown">Не указано</option><option value="yes">Колеруется</option><option value="no">Не колеруется</option>
              </select>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-[10px] font-semibold text-slate-400">Совместимые поверхности</legend>
              <div className="flex flex-wrap gap-2">{paintMaterials.map((item) => <label key={item.id} className="flex items-center gap-1.5 rounded-lg border border-[#2b323c] bg-[#0c1015] px-2.5 py-2 text-[10px] text-slate-300">
                <input type="checkbox" checked={customPaintDraft.compatibleMaterials.includes(item.id)} onChange={(event) => setCustomPaintDraft((draft) => ({ ...draft, compatibleMaterials: event.target.checked ? [...new Set([...draft.compatibleMaterials, item.id])] : draft.compatibleMaterials.filter((id) => id !== item.id) }))} className="accent-[var(--primary-400)]" />
                {item.label}
              </label>)}</div>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-[10px] font-semibold text-slate-400">{customPaintDraft.category === 'plaster' ? 'Расход штукатурки, кг/м²' : 'Расход, м²/л'}
                <input name="coverage" type="number" required min="0.1" max="100" step="0.1" value={customPaintDraft.coverage} onChange={(event) => setCustomPaintDraft((draft) => ({ ...draft, coverage: event.target.value }))} className="field mt-1.5 w-full rounded-lg px-3 py-2.5 text-xs" />
              </label>
              <label className="block text-[10px] font-semibold text-slate-400">Фасовки, {customPaintDraft.category === 'plaster' ? 'кг' : 'л'} через запятую
                <input name="packages" value={customPaintDraft.packages} onChange={(event) => setCustomPaintDraft((draft) => ({ ...draft, packages: event.target.value }))} placeholder={customPaintDraft.category === 'plaster' ? '5, 15, 25' : '0.9, 2.7, 9'} className="field mt-1.5 w-full rounded-lg px-3 py-2.5 text-xs" />
              </label>
            </div>
            <label className="block text-[10px] font-semibold text-slate-400">Цена за {customPaintDraft.category === 'plaster' ? 'кг' : 'литр'}, ₽ <span className="font-normal text-slate-600">· необязательно</span>
              <input name="pricePerUnit" type="number" min="0" max="1000000" step="0.01" value={customPaintDraft.pricePerUnit} onChange={(event) => setCustomPaintDraft((draft) => ({ ...draft, pricePerUnit: event.target.value }))} placeholder="Например, 890" className="field mt-1.5 w-full rounded-lg px-3 py-2.5 text-xs" />
            </label>
            <label className="block text-[10px] font-semibold text-slate-400">Тип / блеск
              <input name="finish" maxLength={80} value={customPaintDraft.finish} onChange={(event) => setCustomPaintDraft((draft) => ({ ...draft, finish: event.target.value }))} placeholder="Например, матовая" className="field mt-1.5 w-full rounded-lg px-3 py-2.5 text-xs" />
            </label>
            <label className="block text-[10px] font-semibold text-slate-400">Примечание о краске
              <input name="purpose" maxLength={180} value={customPaintDraft.purpose} onChange={(event) => setCustomPaintDraft((draft) => ({ ...draft, purpose: event.target.value }))} placeholder="Назначение или ваши заметки" className="field mt-1.5 w-full rounded-lg px-3 py-2.5 text-xs" />
            </label>
            <label className="block text-[10px] font-semibold text-slate-400">Система баз / примечание
              <input name="baseSystem" maxLength={120} value={customPaintDraft.baseSystem} onChange={(event) => setCustomPaintDraft((draft) => ({ ...draft, baseSystem: event.target.value }))} placeholder="Например, уточнить коды баз у производителя" className="field mt-1.5 w-full rounded-lg px-3 py-2.5 text-xs" />
            </label>
            <fieldset>
              <legend className="mb-2 text-[10px] font-semibold text-slate-400">Совместимые базы колеровки (если известны)</legend>
              {customPaintDraft.tintable === false
                ? <p className="text-[9px] text-slate-500">Для неколеруемой краски базы не применяются.</p>
                : <div className="flex gap-2">{['A', 'C'].map((base) => <label key={base} className="flex items-center gap-1.5 rounded-lg border border-[#2b323c] bg-[#0c1015] px-2.5 py-2 text-[10px] text-slate-300">
                <input type="checkbox" name="tintBase" value={base} checked={customPaintDraft.tintBases.includes(base)} onChange={(event) => setCustomPaintDraft((draft) => ({ ...draft, tintBases: event.target.checked ? [...new Set([...draft.tintBases, base])] : draft.tintBases.filter((item) => item !== base) }))} className="accent-[var(--primary-400)]" />
                База {base}
              </label>)}</div>}
              <p className="mt-1.5 text-[9px] leading-relaxed text-slate-500">Если не отметить базу, приложение предупредит, что её совместимость не подтверждена.</p>
            </fieldset>
            <div className="flex justify-end gap-2 border-t border-[#252b33] pt-4">
              <button type="button" onClick={closeCatalogEntryForm} className="btn-secondary rounded-lg px-4 py-2.5 text-xs font-semibold">Отмена</button>
              <button type="submit" disabled={Boolean(catalogSavingId)} className="btn-primary flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold disabled:opacity-50"><Plus size={14} />{editingCatalogEntry ? 'Сохранить изменения' : 'Сохранить краску'}</button>
            </div>
          </form>}
        </section>
      </div>}

      <CatalogManagementDialog
        open={catalogManagerOpen && Boolean(apiBaseUrl)}
        view={catalogManagerType}
        colors={availableColors}
        paints={availablePaintProducts}
        busyId={catalogSavingId}
        onClose={() => setCatalogManagerOpen(false)}
        onAddColor={() => openCatalogEntryForm('color')}
        onAddPaint={() => openCatalogEntryForm('paint')}
        onEditColor={(color) => openCatalogEntryForm('color', color)}
        onDeleteColor={(color) => deleteCatalogEntry('color', color)}
        onEditPaint={(paint) => openCatalogEntryForm('paint', paint)}
        onDeletePaint={(paint) => deleteCatalogEntry('paint', paint)}
      />

      {expandedColor && <div className="fixed inset-0 z-[80] flex min-h-[100dvh] w-screen flex-col justify-between overflow-hidden" style={{ backgroundColor: expandedColor.hex }}>
        <section role="dialog" aria-modal="true" aria-labelledby="expanded-color-title" className="relative flex min-h-[100dvh] flex-col justify-between p-5 pt-[max(20px,env(safe-area-inset-top))] sm:p-8 sm:pt-[max(32px,env(safe-area-inset-top))]">
          <div className="flex items-start justify-between gap-4">
            <span className="rounded-full border border-white/20 bg-black/20 px-3 py-1.5 text-[10px] font-semibold tracking-[.12em] text-white/80 backdrop-blur">ПОЛНОЭКРАННЫЙ ОБРАЗЕЦ</span>
            <button autoFocus onClick={() => setExpandedColor(null)} aria-label="Закрыть полноэкранный образец" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/25 bg-black/25 text-white shadow-lg backdrop-blur transition hover:bg-black/45"><X size={19} /></button>
          </div>
          <div className="relative mx-auto w-full max-w-2xl rounded-2xl border border-white/15 bg-black/45 p-3.5 text-white shadow-2xl backdrop-blur-xl sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[9px] font-bold tracking-[.12em] text-white/65">{getCatalogLabel(expandedColor.catalog)}</div>
                <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <h2 id="expanded-color-title" className="font-['Manrope'] text-2xl font-extrabold leading-tight tracking-[-.04em] sm:text-3xl">{expandedColor.code}</h2>
                  <p className="text-sm font-medium leading-snug text-white/90 sm:text-base">{expandedColor.name_ru}</p>
                </div>
              </div>
              <div><span className="block text-[9px] font-bold tracking-[.14em] text-white/55">ЦИФРОВОЙ ОБРАЗЕЦ</span><span className="mt-0.5 block font-mono text-lg font-semibold">{expandedColor.hex}</span></div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2"><span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[10px] font-semibold">LRV {expandedColor.lrv}%</span><span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[10px] font-semibold">База {expandedColor.base}</span></div>
            {expandedColor.hexEstimated && <p className="mt-3 text-[10px] leading-relaxed text-white/70">Экранный оттенок приблизительный; цвет зависит от дисплея и освещения. Перед покупкой проверьте веер и сделайте пробный выкрас.</p>}
            <button onClick={() => { selectColor(expandedColor); setExpandedColor(null); }} className="btn-primary mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold"><Check size={16} />Выбрать этот цвет</button>
          </div>
        </section>
      </div>}

      {drawerOpen && <div className="fixed inset-0 z-40 flex justify-end">
        <button aria-label="Закрыть панель" onClick={() => setDrawerOpen(false)} className="drawer-backdrop absolute inset-0" />
        <aside role="dialog" aria-modal="true" aria-label="Клиенты и проекты" className="drawer relative flex h-full w-full max-w-[470px] flex-col border-l border-[#29303a] bg-[#10141a]">
          <div className="flex items-center justify-between border-b border-[#252b33] px-5 py-5">
            <div><div className="eyebrow">КЛИЕНТЫ И ПРОЕКТЫ</div><h2 className="mt-1 font-['Manrope'] text-lg font-bold">Проекты колеровки</h2></div>
            <button aria-label="Закрыть панель" onClick={() => setDrawerOpen(false)} className="icon-button h-9 w-9 rounded-lg text-slate-400"><X size={18} /></button>
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto p-5 scrollbar-thin">
            <section>
              <div className="mb-3 flex items-center justify-between"><div className="eyebrow">КАРТОЧКИ КЛИЕНТОВ</div><span className="text-[10px] text-slate-500">{visibleClients.length}</span></div>
              {visibleClients.length > 0 && <div className="mb-3 grid gap-2">
                {visibleClients.map((client) => {
                  const isActive = activeClientId === client.id;
                  return <button key={client.id} onClick={(event) => { clientCardTriggerRef.current = event.currentTarget; setActiveClientId(client.id); setClientCardId(client.id); setConfirmClientDeletion(false); setDeletePinInput(''); }} aria-haspopup="dialog" className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${isActive ? 'accent-selection' : 'border-[#2b323c] bg-[#0d1117] hover:bg-[#181e25]'}`}>
                    <span className="accent-surface text-[var(--primary-300)] flex h-9 w-9 shrink-0 items-center justify-center rounded-full"><UserRound size={16} /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{client.name}</span><span className="mt-1 block text-[10px] text-slate-500">Телефон ···· {client.phoneLast4}</span></span>
                    {isActive && <Check size={14} className="text-[var(--primary-300)]" />}
                  </button>;
                })}
              </div>}
              <form onSubmit={addClient} className="subtle-panel space-y-3 p-3.5">
                <div className="text-xs font-semibold">{visibleClients.length ? 'Добавить клиента' : 'Создать карточку клиента'}</div>
                <input value={clientNameInput} onChange={(event) => setClientNameInput(event.target.value)} autoComplete="name" placeholder="Имя клиента" aria-label="Имя клиента" className="field w-full rounded-lg px-3 py-2.5 text-xs" />
                <input value={clientPhoneInput} onChange={(event) => setClientPhoneInput(event.target.value)} type="tel" autoComplete="tel" inputMode="tel" placeholder="Номер телефона" aria-label="Номер телефона" className="field w-full rounded-lg px-3 py-2.5 text-xs" />
                <div className="grid grid-cols-2 gap-2">
                  <input value={clientPinInput} onChange={(event) => setClientPinInput(event.target.value.replace(/\D/g, '').slice(0, 6))} type="password" inputMode="numeric" autoComplete="new-password" placeholder="PIN · 6 цифр" aria-label="PIN-код карточки клиента" className="field min-w-0 rounded-lg px-3 py-2.5 text-xs" />
                  <input value={clientPinConfirmation} onChange={(event) => setClientPinConfirmation(event.target.value.replace(/\D/g, '').slice(0, 6))} type="password" inputMode="numeric" autoComplete="new-password" placeholder="Повторите PIN" aria-label="Подтверждение PIN-кода" className="field min-w-0 rounded-lg px-3 py-2.5 text-xs" />
                </div>
                <p className="text-[10px] leading-relaxed text-slate-500">PIN сохраните отдельно: он понадобится для удаления карточки. На других устройствах карточка и проекты доступны для просмотра.</p>
                <label className="flex items-start gap-2 text-[10px] leading-relaxed text-slate-400"><input type="checkbox" name="clientConsent" className="mt-0.5 shrink-0 accent-[var(--primary-400)]" /><span>Клиент согласен на хранение полного номера в приватной общей базе. Имя, последние 4 цифры и проекты видны посетителям сайта. Подробности — в <a href="https://github.com/Niks343/KolorLab1/blob/main/PRIVACY.md" target="_blank" rel="noreferrer" className="text-[var(--primary-300)] underline underline-offset-2">уведомлении</a>.</span></label>
                <button type="submit" className="btn-secondary flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold"><Users size={14} />Сохранить клиента</button>
              </form>
            </section>
            <section>
              <div className="mb-3 flex items-center justify-between"><div className="eyebrow">ПРОЕКТЫ КЛИЕНТА</div>{activeClient && <span className="text-[10px] text-slate-500">{activeClient.name} ···· {activeClient.phoneLast4}</span>}</div>
              <form onSubmit={createProject} className="subtle-panel mb-3 flex gap-2 p-2.5">
                <input value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="Название проекта" aria-label="Название нового проекта" className="field min-w-0 flex-1 rounded-lg px-2.5 py-2 text-xs" />
                <button type="submit" className="btn-secondary flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-[10px] font-semibold"><Plus size={13} />Создать</button>
              </form>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {projectNames.map((name) => <button key={name} onClick={() => setActiveProjectName(name)} className={`chip rounded-md px-2.5 py-1.5 text-[10px] font-semibold ${activeProjectName === name ? 'active' : ''}`}>{name}</button>)}
              </div>
              {!activeClient ? <div className="rounded-xl border border-dashed border-[#343b45] px-4 py-8 text-center text-xs text-slate-500">Создайте или выберите клиента, чтобы посмотреть и сохранить его проекты.</div> :
                clientProjects.length ? <div className="space-y-3">
                  {clientProjects.map((item) => <article key={item.key} className="subtle-panel p-3.5">
                    <div className="flex items-start gap-3">
                      <span className="h-11 w-11 shrink-0 rounded-lg border border-white/10" style={{ backgroundColor: item.color.hex }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold">{item.color.code}</span><button onClick={() => setProjects((items) => items.filter((saved) => saved.key !== item.key))} className="action-danger text-slate-600" title="Удалить"><X size={14} /></button></div>
                        <div className="mt-1 truncate text-[11px] text-slate-400">{item.clientName} ···· {item.clientPhoneLast4}</div>
                        <div className="mt-1 truncate text-[11px] text-slate-400">{item.color.name_ru} · {item.zone}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2"><BaseBadge base={item.base} /><span className="text-[10px] text-slate-500">{item.liters.toFixed(1).replace('.', ',')} {item.quantityUnit === 'kg' ? 'кг' : 'л'} · {item.cans}</span></div>
                        {item.paintProduct && <div className="mt-1 text-[10px] text-slate-500">{item.paintProduct.brand} · {item.paintProduct.name}{Number.isFinite(item.paintProduct.pricePerUnit ?? item.paintProduct.pricePerLiter) ? ` · ${(item.paintProduct.pricePerUnit ?? item.paintProduct.pricePerLiter).toLocaleString('ru-RU')} ₽/${item.quantityUnit === 'kg' ? 'кг' : 'л'}` : ''}</div>}
                        {item.area && <div className="mt-1 text-[10px] text-slate-600">{item.area} м² · {item.layers} сл. · {surfaces.find((surfaceItem) => surfaceItem.id === item.surface)?.label ?? 'Поверхность'}</div>}
                      </div>
                    </div>
                  </article>)}
                  <div className="subtle-panel mt-4 p-4">
                    <div className="eyebrow mb-3">СВОДКА ПО ОСНОВАМ</div>
                    {['A', 'C'].map((base) => { const quantity = clientProjects.filter((item) => item.base === base).length; return <div key={base} className="flex items-center justify-between border-b border-[#232a32] py-2 last:border-0"><BaseBadge base={base} /><span className="text-xs text-slate-400">{quantity} {quantity === 1 ? 'оттенок' : 'оттенков'}</span></div>; })}
                    {clientProjects.some((item) => !item.base) && <div className="flex items-center justify-between border-b border-[#232a32] py-2 last:border-0"><BaseBadge base={null} /><span className="text-xs text-slate-400">{clientProjects.filter((item) => !item.base).length} {clientProjects.filter((item) => !item.base).length === 1 ? 'оттенок' : 'оттенков'}</span></div>}
                  </div>
                </div> : <div className="rounded-xl border border-dashed border-[#343b45] px-4 py-8 text-center text-xs text-slate-500">У клиента пока нет проектов. Выберите цвет и добавьте его в проект.</div>}
            </section>
          </div>
          <div className="border-t border-[#252b33] p-5">
            <button disabled={!clientProjects.length} onClick={copyOrder} className="btn-primary flex w-full items-center justify-center gap-2 rounded-lg py-3 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40">{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Скопировано' : 'Скопировать для магазина'}</button>
            <button disabled={!clientProjects.length} onClick={downloadOrder} className="btn-secondary mt-2 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"><FileDown size={15} />Скачать спецификацию TXT</button>
            <button disabled={!clientProjects.length} onClick={() => window.print()} className="btn-secondary mt-2 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"><Printer size={15} />Печать / сохранить PDF</button>
            <div role="status" className={`mt-3 text-center text-[10px] ${persistenceError ? 'base-warning' : 'text-slate-600'}`}>{persistenceError ? 'Не удалось сохранить изменения на этом устройстве.' : remoteProjectsLoaded ? 'Клиенты и проекты синхронизируются между устройствами.' : 'Загружаем общие проекты…'}</div>
            <div className="mt-2 text-center text-[10px] text-slate-600">В заказ попадут только имя клиента и последние 4 цифры телефона.</div>
          </div>
        </aside>
      </div>}
      {openedClientCard && <div className="fixed inset-0 z-[60] grid w-screen place-items-center p-4">
        <button aria-label="Закрыть карточку клиента" onClick={() => { setClientCardId(''); setConfirmClientDeletion(false); setDeletePinInput(''); clientCardTriggerRef.current?.focus(); }} className="drawer-backdrop absolute inset-0" />
        <section role="dialog" aria-modal="true" aria-labelledby="client-card-title" className="relative z-10 flex max-h-[min(680px,calc(100dvh-32px))] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#303944] bg-[#11161d] shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-[#252d37] px-5 py-5 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <span className="accent-surface flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[var(--primary-300)]"><UserRound size={20} /></span>
              <div className="min-w-0">
                <div className="eyebrow">КАРТОЧКА КЛИЕНТА</div>
                <h2 id="client-card-title" className="mt-1 truncate font-['Manrope'] text-lg font-bold">{openedClientCard.name}</h2>
                <p className="mt-1 text-xs text-slate-400">Телефон ···· {openedClientCard.phoneLast4}</p>
              </div>
            </div>
            <button ref={clientCardCloseRef} aria-label="Закрыть карточку клиента" onClick={() => { setClientCardId(''); setConfirmClientDeletion(false); setDeletePinInput(''); clientCardTriggerRef.current?.focus(); }} className="icon-button h-9 w-9 shrink-0 rounded-lg text-slate-400"><X size={18} /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 scrollbar-thin sm:px-6">
            <div className="mb-3 flex items-center justify-between">
              <div className="eyebrow">ПРОЕКТЫ КЛИЕНТА</div>
              <span className="text-[10px] text-slate-500">{openedClientProjects.length}</span>
            </div>
            {openedClientProjects.length ? <div className="space-y-2">
              {openedClientProjects.map((item) => <article key={item.key} className="subtle-panel flex items-center gap-3 p-3">
                <span className="h-11 w-11 shrink-0 rounded-lg border border-white/10" style={{ backgroundColor: item.color.hex }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold">{item.projectName}</div>
                  <div className="mt-1 truncate text-[11px] text-slate-400">{item.color.code} · {item.color.name_ru}</div>
                  <div className="mt-1 truncate text-[10px] text-slate-500">{item.zone} · {item.liters.toFixed(1).replace('.', ',')} {item.quantityUnit === 'kg' ? 'кг' : 'л'} · {item.base ? `База ${item.base}` : 'Без базы'}</div>
                </div>
              </article>)}
            </div> : <div className="rounded-xl border border-dashed border-[#343b45] px-4 py-8 text-center text-xs text-slate-500">У клиента пока нет сохранённых проектов.</div>}
          </div>
          <div className="space-y-3 border-t border-[#252d37] p-4 sm:px-6">
            {!openedClientCard.hasPin ? <p className="rounded-lg border border-[#2b323c] bg-[#0d1117] p-3 text-[10px] leading-relaxed text-slate-500">Эта карточка создана до введения PIN-кода. Для защиты клиента её удаление отключено.</p>
              : confirmClientDeletion ? <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
              <p className="text-xs leading-relaxed text-slate-300">Удалить общую карточку «{openedClientCard.name}» и все проекты? Телефон может остаться в истории GitHub. Это действие нельзя отменить.</p>
              <input value={deletePinInput} onChange={(event) => setDeletePinInput(event.target.value.replace(/\D/g, '').slice(0, 6))} type="password" inputMode="numeric" autoComplete="current-password" placeholder="Введите PIN-код из 6 цифр" aria-label="PIN-код для удаления карточки" className="field mt-3 w-full rounded-lg px-3 py-2.5 text-xs" />
              <div className="mt-3 flex gap-2">
                <button onClick={deleteClient} className="flex-1 rounded-lg bg-rose-500/15 px-3 py-2.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/25">Удалить карточку</button>
                <button onClick={() => { setConfirmClientDeletion(false); setDeletePinInput(''); }} className="btn-secondary rounded-lg px-4 py-2.5 text-xs font-semibold">Отмена</button>
              </div>
            </div> : <button onClick={() => setConfirmClientDeletion(true)} className="flex w-full items-center justify-center gap-2 rounded-lg border border-rose-500/20 px-3 py-2.5 text-xs font-semibold text-rose-300 transition hover:border-rose-500/40 hover:bg-rose-500/10"><Trash2 size={14} />Удалить клиента</button>}
          </div>
        </section>
      </div>}
      <section className="print-specification" aria-label="Печатная спецификация проекта">
        <div className="print-brand">KOLOR<span>LAB</span> · ЦИФРОВАЯ ЛАБОРАТОРИЯ ЦВЕТА</div>
        <h1>Спецификация окрашивания</h1>
        <p className="print-client">Проект: <strong>{activeProjectName}</strong></p>
        {activeClient
          ? <p className="print-client">Клиент: <strong>{activeClient.name}</strong> · телефон ···· {activeClient.phoneLast4}</p>
          : <p className="print-client">Клиент: не выбран</p>}
        <p className="print-date">Сформировано {new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long' }).format(new Date())}</p>
        {clientProjects.length ? <>
          <table>
            <thead><tr><th>Зона</th><th>Цвет и каталог</th><th>Площадь / слои</th><th>База</th><th>Объём и фасовка</th></tr></thead>
            <tbody>{clientProjects.map((item) => <tr key={item.key}>
              <td>{item.zone}</td>
              <td><span className="print-color-chip" style={{ backgroundColor: item.color.hex }} /> <strong>{item.color.code}</strong><br />{item.color.name_ru}<br /><span>{item.color.catalog} · {item.color.hex}</span>{item.paintProduct && <><br /><strong>{item.paintProduct.brand} · {item.paintProduct.name}</strong><br /><span>{item.paintProduct.baseSystem}</span>{item.paintProduct.availabilityNote && <><br /><span>{item.paintProduct.availabilityNote}</span></>}{Number.isFinite(item.paintProduct.pricePerUnit ?? item.paintProduct.pricePerLiter) && <><br /><span>{(item.paintProduct.pricePerUnit ?? item.paintProduct.pricePerLiter).toLocaleString('ru-RU')} ₽/{item.quantityUnit === 'kg' ? 'кг' : 'л'} · ориентировочно {(item.liters * (item.paintProduct.pricePerUnit ?? item.paintProduct.pricePerLiter)).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽</span></>}</>}</td>
              <td>{item.area ? `${item.area} м²` : '—'}<br />{item.layers ? `${item.layers} слоя` : 'слои не указаны'}<br />{surfaces.find((surfaceItem) => surfaceItem.id === item.surface)?.label ?? '—'}</td>
              <td>{item.base ? `База ${item.base}` : 'Без колеровочной базы'}</td>
              <td>{item.liters.toFixed(1).replace('.', ',')} {item.quantityUnit === 'kg' ? 'кг' : 'л'}<br /><span>{item.cans}</span></td>
            </tr>)}</tbody>
          </table>
          <div className="print-totals">
            <strong>Итого материалов: {clientProjects.filter((item) => item.quantityUnit !== 'kg').reduce((total, item) => total + item.liters, 0).toFixed(1).replace('.', ',')} л · {clientProjects.filter((item) => item.quantityUnit === 'kg').reduce((total, item) => total + item.liters, 0).toFixed(1).replace('.', ',')} кг</strong>
            <span>База A: {clientProjects.filter((item) => item.base === 'A' && item.quantityUnit !== 'kg').reduce((total, item) => total + item.liters, 0).toFixed(1).replace('.', ',')} л / {clientProjects.filter((item) => item.base === 'A' && item.quantityUnit === 'kg').reduce((total, item) => total + item.liters, 0).toFixed(1).replace('.', ',')} кг · База C: {clientProjects.filter((item) => item.base === 'C' && item.quantityUnit !== 'kg').reduce((total, item) => total + item.liters, 0).toFixed(1).replace('.', ',')} л / {clientProjects.filter((item) => item.base === 'C' && item.quantityUnit === 'kg').reduce((total, item) => total + item.liters, 0).toFixed(1).replace('.', ',')} кг · Без базы: {clientProjects.filter((item) => !item.base && item.quantityUnit !== 'kg').reduce((total, item) => total + item.liters, 0).toFixed(1).replace('.', ',')} л / {clientProjects.filter((item) => !item.base && item.quantityUnit === 'kg').reduce((total, item) => total + item.liters, 0).toFixed(1).replace('.', ',')} кг{projectCost > 0 ? ` · ориентировочная стоимость: ${projectCost.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽` : ''}</span>
          </div>
        </> : <p>В проект пока не добавлены цвета.</p>}
        <p className="print-note">Цифровые HEX-образцы предназначены для ориентира и могут отличаться от готового покрытия. Перед закупкой уточните код, базу, тип краски и фасовку у продавца; рекомендован пробный выкрас.</p>
        <div className="print-footer">KolorLab · Спецификация для расчёта и согласования заказа</div>
      </section>
      {toast && <div role="status" className="toast-success fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl border px-4 py-3 text-xs font-semibold shadow-2xl"><Check size={15} />{toast}</div>}
      {welcomeOpen && <div
        className="welcome-screen fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-4 sm:p-8"
        role="button"
        tabIndex={0}
        aria-label="Приветствие KolorLab. Нажмите, чтобы начать."
        onClick={dismissWelcome}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            dismissWelcome();
          }
        }}
      >
        <div className="welcome-glass relative w-full max-w-3xl overflow-hidden rounded-[28px] p-6 sm:p-10">
          <div className="welcome-orb welcome-orb-one" aria-hidden="true" />
          <div className="welcome-orb welcome-orb-two" aria-hidden="true" />
          <div className="relative z-[1]">
          <div className="mb-7 flex items-center">
            <img className="welcome-logo" src={kolorlabLogo} alt="KolorLab — лаборатория цвета" />
          </div>
            <div className="eyebrow mb-3">ЦИФРОВАЯ ЛАБОРАТОРИЯ ЦВЕТА И КОЛЕРОВКИ</div>
            <h1 className="max-w-2xl font-['Manrope'] text-3xl font-extrabold leading-[1.08] tracking-[-.045em] text-white sm:text-5xl">От идеи до точного <span className="welcome-accent">оттенка</span></h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base sm:leading-7">KolorLab помогает подобрать цвет, увидеть его на поверхности и подготовить расчёт краски и спецификацию для покупки.</p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <div className="welcome-feature"><Search size={17} /><span><strong>Подбор цвета</strong><small>Каталоги RAL, NCS, Tikkurila и другие</small></span></div>
              <div className="welcome-feature"><Layers3 size={17} /><span><strong>Визуализация</strong><small>Поверхности и разное освещение</small></span></div>
              <div className="welcome-feature"><Droplets size={17} /><span><strong>Расчёт краски</strong><small>Объём и удобные варианты фасовки</small></span></div>
              <div className="welcome-feature"><FileDown size={17} /><span><strong>Проект и спецификация</strong><small>Сохраните оттенки по комнатам и зонам</small></span></div>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
              <span className="text-[10px] leading-5 text-white/45">Цвет на экране приблизительный — перед покупкой рекомендуем пробный выкрас.</span>
              <span className="welcome-hint inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[.07] px-4 py-2.5 text-xs font-semibold text-white/80">Нажмите, чтобы начать <ArrowRight size={14} /></span>
            </div>
          </div>
        </div>
      </div>}
    </div>
  );
}

export default App;
