import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDown, ArrowDownUp, ArrowRight, Building2, Check, ChevronDown, Copy, Droplets, FileDown,
  Expand, GitCompareArrows, Image as ImageIcon, Layers3, Lightbulb, Menu, Paintbrush, Plus, Printer,
  Search, ShoppingBag, SlidersHorizontal, Trash2, UserRound,
  Users, X,
} from 'lucide-react';
import baseColors from './data/colors.json';
import farrowBallColors from './data/farrowBall.js';
import { getTintingBase } from './data/colorBase.js';
import { filterColors, getColorFamily, getColorRecommendations, rgbToLab, deltaEFromLab } from './data/colorTools.js';
import paintProducts from './data/paintProducts.js';
import smoothWallImage from './assets/surfaces/smooth-wall.jpg';
import wallpaperImage from './assets/surfaces/paintable-wallpaper.jpg';
import plasterImage from './assets/surfaces/plaster.jpg';

const colors = [
  ...baseColors.map((color) => ({ ...color, base: getTintingBase(color.hex, color.lrv, color.baseOverride) })),
  ...farrowBallColors,
];
const colorsById = new Map(colors.map((color) => [color.id, color]));
const paintProductsById = new Map(paintProducts.map((product) => [product.id, product]));
const workspaceStorageKey = 'kolorlab.workspace.v1';
const welcomeStorageKey = 'kolorlab.welcome.dismissed.v1';
const defaultProjectName = 'Общий проект';
const catalogLabels = {
  'RAL Classic': 'RAL',
  'Tikkurila Symphony': 'Tikkurila',
};

function getCatalogLabel(catalog) {
  return catalogLabels[catalog] ?? catalog.replace(' 3D-System Plus', '');
}

function hasDismissedWelcome() {
  try {
    return window.localStorage.getItem(welcomeStorageKey) === 'true';
  } catch {
    return false;
  }
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

const colorIndex = colors.map((color) => ({
  color,
  lab: rgbToLab(color.rgb),
  searchText: `${color.code} ${color.name_ru} ${color.name_en ?? ''} ${color.catalog} ${(color.applications ?? []).join(' ')}`.toLowerCase(),
}));

function getCatalogAlternatives(sourceColor) {
  const source = colorIndex.find(({ color }) => color.id === sourceColor.id);
  if (!source) return [];
  const candidates = colorIndex
    .filter(({ color }) => color.catalog !== sourceColor.catalog)
    .map(({ color, lab }) => ({ color, distance: deltaEFromLab(source.lab, lab) }))
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

function optimizeProductPackages(liters, packageSizes, tintBase = '') {
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
    .map((count, index) => count && `${count} × ${packageSizes[index].toLocaleString('ru-RU')} л${tintBase ? ` (База ${tintBase})` : ''}`)
    .filter(Boolean)
    .join(' + ');
}

function getProductPackageSizes(product, tintBase) {
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
      activeClientId: '',
      activePaintProductId: '',
      paintPricesByProduct: {},
      activeProjectName: defaultProjectName,
      projectNames: [defaultProjectName],
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

    const clients = parsed.clients
      .filter((client) => client && typeof client.id === 'string' && typeof client.name === 'string')
      .map((client) => ({
        id: client.id,
        name: client.name,
        phoneLast4: String(client.phoneLast4 ?? '').replace(/\D/g, '').slice(-4),
      }));
    const clientIds = new Set(clients.map((client) => client.id));
    const projects = parsed.projects.flatMap((item) => {
      if (!item || typeof item.key !== 'string' || !clientIds.has(item.clientId)) return [];
      const colorId = item.color?.id;
      const color = typeof colorId === 'string'
        ? colorsById.get(colorId) ?? getArchivedWoodProjectColor(colorId)
        : null;
      if (!color) return [];
      const surfaceId = surfaces.some((surfaceItem) => surfaceItem.id === item.surface) ? item.surface : 'wall';
      return [{
        key: item.key,
        clientId: item.clientId,
        projectName: typeof item.projectName === 'string' && item.projectName.trim() ? item.projectName : defaultProjectName,
        clientName: clients.find((client) => client.id === item.clientId)?.name ?? '',
        clientPhoneLast4: clients.find((client) => client.id === item.clientId)?.phoneLast4 ?? '',
        color,
        base: color.base,
        zone: zones.includes(item.zone) ? item.zone : 'Гостиная',
        liters: Number.isFinite(item.liters) ? item.liters : 0,
        cans: typeof item.cans === 'string' ? item.cans : '',
        paintProduct: typeof item.paintProduct?.id === 'string' && paintProductsById.has(item.paintProduct.id)
          ? {
            ...paintProductsById.get(item.paintProduct.id),
            pricePerLiter: Number.isFinite(item.paintProduct.pricePerLiter) ? item.paintProduct.pricePerLiter : null,
          }
          : null,
        area: Number.isFinite(item.area) ? item.area : null,
        layers: Number.isFinite(item.layers) ? item.layers : null,
        surface: surfaceId,
      }];
    });
    const paintPricesByProduct = Object.fromEntries(
      Object.entries(parsed.paintPricesByProduct ?? {})
        .filter(([id, price]) => paintProductsById.has(id) && Number.isFinite(price) && price >= 0),
    );
    const activeClientId = clientIds.has(parsed.activeClientId) ? parsed.activeClientId : '';
    const activePaintProductId = paintProductsById.has(parsed.activePaintProductId) ? parsed.activePaintProductId : '';
    const projectNames = [...new Set([
      ...(Array.isArray(parsed.projectNames) ? parsed.projectNames.filter((name) => typeof name === 'string' && name.trim()).map((name) => name.trim()) : []),
      ...projects.map((project) => project.projectName),
      defaultProjectName,
    ])];
    const activeProjectName = projectNames.includes(parsed.activeProjectName) ? parsed.activeProjectName : projectNames[0];
    const selectedId = colorsById.has(parsed.selectedColorId) ? parsed.selectedColorId : colors[0].id;
    const comparisonIds = Array.isArray(parsed.comparisonIds)
      ? [...new Set(parsed.comparisonIds.filter((id) => colorsById.has(id)))].slice(0, 6)
      : [];
    const previewSurface = visualSurfaces.some(({ id }) => id === parsed.previewSurface) ? parsed.previewSurface : 'wall';
    const temperature = temperatures.some(({ value }) => value === parsed.temperature) ? parsed.temperature : 4000;
    const area = Number.isFinite(parsed.area) ? Math.max(5, Math.min(150, parsed.area)) : 32;
    const layers = [1, 2, 3].includes(parsed.layers) ? parsed.layers : 2;
    const zone = zones.includes(parsed.zone) ? parsed.zone : 'Гостиная';
    return { clients, projects, activeClientId, activePaintProductId, paintPricesByProduct, activeProjectName, projectNames, selectedId, comparisonIds, previewSurface, temperature, area, layers, zone, error: false };
  } catch (error) {
    console.error('Не удалось загрузить локальные данные KolorLab.', error);
    return { clients: [], projects: [], activeClientId: '', activePaintProductId: '', paintPricesByProduct: {}, activeProjectName: defaultProjectName, projectNames: [defaultProjectName], selectedId: colors[0].id, comparisonIds: [], previewSurface: 'wall', temperature: 4000, area: 32, layers: 2, zone: 'Гостиная', error: true };
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
  const [welcomeOpen, setWelcomeOpen] = useState(() => !hasDismissedWelcome());
  const [selectedId, setSelectedId] = useState(initialWorkspace.selectedId);
  const [catalog, setCatalog] = useState(null);
  const [baseFilter, setBaseFilter] = useState('Все базы');
  const [applicationFilter, setApplicationFilter] = useState('all');
  const [familyFilter, setFamilyFilter] = useState('Все семейства');
  const [lightnessFilter, setLightnessFilter] = useState('Любая светлота');
  const [search, setSearch] = useState('');
  const [surface, setSurface] = useState(() => {
    const product = paintProductsById.get(initialWorkspace.activePaintProductId);
    return product && !product.surfaces.includes('wall') ? product.surfaces[0] : 'wall';
  });
  const [previewSurface, setPreviewSurface] = useState(() => {
    if (initialWorkspace.previewSurface) return initialWorkspace.previewSurface;
    const product = paintProductsById.get(initialWorkspace.activePaintProductId);
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
  const [projectNames, setProjectNames] = useState(initialWorkspace.projectNames);
  const [activeProjectName, setActiveProjectName] = useState(initialWorkspace.activeProjectName);
  const [newProjectName, setNewProjectName] = useState('');
  const [clientNameInput, setClientNameInput] = useState('');
  const [clientPhoneInput, setClientPhoneInput] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [clientCardId, setClientCardId] = useState('');
  const [confirmClientDeletion, setConfirmClientDeletion] = useState(false);
  const clientCardTriggerRef = useRef(null);
  const clientCardCloseRef = useRef(null);
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
  const loadMoreRef = useRef(null);
  const analogMenuRef = useRef(null);
  const catalogPanelRef = useRef(null);
  const holdTimerRef = useRef(null);
  const suppressCardClickRef = useRef(false);
  const skipInitialPersistenceRef = useRef(true);
  const closeCatalog = () => {
    setCatalogOpen(false);
    setCatalogShowTop(false);
    setActiveMobileTab((tab) => tab === 'Цвет' ? 'Визуализация' : tab);
  };
  const dismissWelcome = () => {
    setWelcomeOpen(false);
    try {
      window.localStorage.setItem(welcomeStorageKey, 'true');
    } catch {
      setToast('Приветствие будет показано при следующем посещении');
    }
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

  const selected = colors.find((color) => color.id === selectedId) ?? colors[0];
  const currentBase = selected.base;
  const selectedPaintProduct = paintProductsById.get(paintProductId) ?? null;
  const selectedPaintBaseSystem = selectedPaintProduct?.baseSystemByTintBase?.[currentBase]
    ?? selectedPaintProduct?.baseSystem
    ?? '';
  const selectedPaintPackageSizes = selectedPaintProduct
    ? getProductPackageSizes(selectedPaintProduct, currentBase)
    : null;
  const currentSurface = surfaces.find((item) => item.id === surface) ?? surfaces[0];
  const currentTemperature = temperatures.find((item) => item.value === temperature) ?? temperatures[1];
  const activeClient = clients.find((client) => client.id === activeClientId) ?? null;
  const openedClientCard = clients.find((client) => client.id === clientCardId) ?? null;
  const openedClientProjects = openedClientCard
    ? projects.filter((item) => item.clientId === openedClientCard.id)
    : [];
  const clientProjects = projects.filter((item) => item.clientId === activeClientId && item.projectName === activeProjectName);
  const paintCoverage = selectedPaintProduct?.coverageBySurface[surface] ?? null;
  const minimumLiters = paintCoverage ? area * layers / paintCoverage[1] : area * layers / currentSurface.rate;
  const liters = paintCoverage ? area * layers / paintCoverage[0] : area * layers / currentSurface.rate;
  const cans = selectedPaintProduct
    ? selectedPaintPackageSizes
      ? optimizeProductPackages(
        liters,
        selectedPaintPackageSizes,
        selectedPaintProduct.tintBases?.includes(currentBase) ? currentBase : '',
      )
      : 'Фасовку уточнить у продавца'
    : optimizeCans(liters, currentBase);
  const paintPricePerLiter = paintProductId ? paintPricesByProduct[paintProductId] : undefined;
  const filteredColors = useMemo(() => filterColors(colors, {
    catalog,
    base: baseFilter,
    application: applicationFilter,
    family: familyFilter,
    lightness: lightnessFilter,
    query: search,
  }), [catalog, baseFilter, applicationFilter, familyFilter, lightnessFilter, search]);
  const visibleColors = filteredColors.slice(0, visibleCount);
  const comparedColors = comparisonIds.map((id) => colorsById.get(id)).filter(Boolean);
  const recommendations = useMemo(
    () => getColorRecommendations(colors, selected, comparisonIds),
    [selected, comparisonIds],
  );

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
        color: { id: color.id },
        zone,
        area: projectArea,
        layers: projectLayers,
        surface: projectSurface,
        liters: projectLiters,
        cans: projectCans,
        paintProduct: paintProduct ? { id: paintProduct.id, pricePerLiter: paintProduct.pricePerLiter } : null,
      }));
      window.localStorage.setItem(workspaceStorageKey, JSON.stringify({
        version: 2,
        clients: clients.map(({ id, name, phoneLast4 }) => ({ id, name, phoneLast4 })),
        projects: storedProjects,
        projectNames,
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
  }, [clients, projects, activeClientId, activeProjectName, projectNames, paintProductId, paintPricesByProduct, selectedId, comparisonIds, previewSurface, temperature, area, layers, zone]);

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
      alternatives: getCatalogAlternatives(color),
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
      cans,
      paintProduct: selectedPaintProduct ? {
        ...selectedPaintProduct,
        pricePerLiter: Number.isFinite(paintPricePerLiter) ? paintPricePerLiter : null,
      } : null,
    }]);
    setToast(`${selected.code} добавлен в проект`);
  };

  const projectCost = clientProjects.reduce((total, item) => total + (Number.isFinite(item.paintProduct?.pricePerLiter) ? item.liters * item.paintProduct.pricePerLiter : 0), 0);
  const orderText = clientProjects.length
    ? `KOLORLAB · СПЕЦИФИКАЦИЯ КОЛЕРОВКИ\nПроект: ${activeProjectName}\nКлиент: ${activeClient.name} · •••• ${activeClient.phoneLast4}\n\n${clientProjects.map((item, index) => `${index + 1}. ${item.zone} — ${item.color.code}, ${item.color.name_ru}\n   Каталог: ${item.color.catalog} · ${item.color.hex}\n   Краска: ${item.paintProduct ? `${item.paintProduct.brand} ${item.paintProduct.name}` : 'не выбрана'}\n   Система баз продукта: ${item.paintProduct?.baseSystem ?? 'не выбрана'}${item.paintProduct?.availabilityNote ? `\n   Важно: ${item.paintProduct.availabilityNote}` : ''}\n   Площадь: ${item.area ?? '—'} м² · слоёв: ${item.layers ?? '—'}\n   Колеровочная база оттенка: ${item.base ? `База ${item.base}` : 'не требуется'} · ${item.liters.toFixed(1).replace('.', ',')} л (${item.cans})${Number.isFinite(item.paintProduct?.pricePerLiter) ? `\n   Ориентировочная стоимость: ${(item.liters * item.paintProduct.pricePerLiter).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽` : ''}`).join('\n\n')}\n\nИтого краски: ${clientProjects.reduce((total, item) => total + item.liters, 0).toFixed(1).replace('.', ',')} л${projectCost ? `\nОриентировочная стоимость известных позиций: ${projectCost.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽` : ''}\n\nПеред покупкой уточните у продавца совместимость оттенка, системы баз и фасовки.`
    : '';

  const createProject = (event) => {
    event.preventDefault();
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
    setProjectNames((items) => [...items, name]);
    setActiveProjectName(name);
    setNewProjectName('');
    setToast(`Создан проект «${name}»`);
  };

  const addClient = (event) => {
    event.preventDefault();
    const name = clientNameInput.trim();
    const phoneDigits = clientPhoneInput.replace(/\D/g, '');
    if (!name || phoneDigits.length < 10) {
      setToast('Укажите имя клиента и номер телефона');
      return;
    }
    const client = {
      id: `client-${Date.now()}`,
      name,
      phoneLast4: phoneDigits.slice(-4),
    };
    setClients((items) => [...items, client]);
    setActiveClientId(client.id);
    setClientNameInput('');
    setClientPhoneInput('');
    setDrawerOpen(false);
    setToast(`Клиент ${client.name} добавлен`);
  };

  const deleteClient = () => {
    if (!openedClientCard) return;
    const removedProjectCount = openedClientProjects.length;
    setClients((items) => items.filter((client) => client.id !== openedClientCard.id));
    setProjects((items) => items.filter((item) => item.clientId !== openedClientCard.id));
    if (activeClientId === openedClientCard.id) setActiveClientId('');
    setClientCardId('');
    setConfirmClientDeletion(false);
    setToast(removedProjectCount
      ? `Клиент «${openedClientCard.name}» удалён. Проектов удалено: ${removedProjectCount}`
      : `Клиент «${openedClientCard.name}» удалён`);
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
      {!isFlat && <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-black/25 px-3 py-2 text-xs text-white/85 backdrop-blur-md"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: currentTemperature.swatch }} />{temperature}K · {currentTemperature.title}</div>}
      {!isFlat && selected.hexEstimated && <div className="absolute bottom-4 right-4 rounded-full bg-black/45 px-3 py-2 text-[10px] font-semibold text-white/85 backdrop-blur-md">Экранный образец · проверьте выкрас</div>}
    </div>
  );

  return (
    <div className="app-shell min-h-screen">
      <header className="topbar sticky top-0 z-20 flex items-center justify-between bg-[#090c11]/90 px-4 backdrop-blur-xl sm:px-7">
        <div className="flex items-center gap-3">
          <div className="brand-mark flex h-9 w-9 items-center justify-center rounded-xl"><span className="font-['Manrope'] text-lg font-extrabold">K</span></div>
          <div><div className="font-['Manrope'] text-[15px] font-extrabold tracking-tight">kolor<span className="lime">lab</span></div><div className="hidden text-[9px] tracking-[.13em] text-slate-500 sm:block">ЛАБОРАТОРИЯ ЦВЕТА</div></div>
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-[#2b323c] bg-[#11151b] px-3 py-1.5 text-[11px] text-slate-400 md:flex"><span className="h-1.5 w-1.5 rounded-full bg-[var(--primary-400)]" />Цифровой подбор цвета <span className="ml-1 text-slate-600">·</span> Москва</div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCatalogOpen(true)} aria-expanded={catalogOpen} className="btn-secondary flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold xl:hidden"><Paintbrush size={15} /><span className="hidden sm:inline">Каталог цветов</span><span className="sm:hidden">Каталог</span></button>
          <button onClick={() => setDrawerOpen(true)} className="btn-secondary flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold"><ShoppingBag size={15} /><span className="hidden sm:inline">Мой проект</span><span className="accent-solid flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold">{projects.length}</span></button>
          <button className="icon-button hidden h-9 w-9 rounded-lg text-slate-400 sm:inline-flex" title="Настройки"><Menu size={17} /></button>
        </div>
      </header>

      <main className="dashboard-main mx-auto flex max-w-[1800px] flex-col px-4 pb-24 pt-6 sm:px-7 sm:pt-8">
        <div className="dashboard-intro mb-6 flex flex-wrap items-end justify-between gap-4">
          <div><div className="eyebrow mb-2">ЦИФРОВАЯ ЛАБОРАТОРИЯ ЦВЕТА И КОЛЕРОВКИ</div><h1 className="font-['Manrope'] text-[26px] font-bold tracking-[-.04em] sm:text-[32px]">Найдите свой <span className="text-[var(--primary-300)]">идеальный цвет</span></h1><p className="mt-1.5 text-sm text-slate-500">Подберите оттенок, оцените на поверхности и рассчитайте объём краски.</p></div>
          <button onClick={() => setDrawerOpen(true)} className="hidden items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white sm:flex">Спецификация проекта <ArrowRight size={14} /></button>
        </div>

        <nav className="mobile-tabbar -mx-4 mb-4 flex gap-1 border-y border-[#222831] px-4 py-2 xl:hidden">
          {['Визуализация', 'Расчёт и подбор', 'Цвет'].map((tab) => <button key={tab} onClick={() => { setActiveMobileTab(tab); if (tab === 'Цвет') setCatalogOpen(true); }} className={`flex-1 rounded-lg py-2 text-[11px] font-semibold ${activeMobileTab === tab ? 'accent-surface text-[var(--primary-100)]' : 'text-slate-500'}`}>{tab}</button>)}
        </nav>

        <div className="dashboard-workspace grid items-stretch gap-5">
          <div className={`dashboard-column ${activeMobileTab !== 'Визуализация' ? 'hidden xl:block' : ''}`}>
            <section className="dashboard-visualizer panel overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#252b33] px-4 py-4 sm:px-5">
                <div><div className="eyebrow">ВИЗУАЛИЗАТОР</div><div className="mt-1 text-sm font-semibold">Посмотрите, как заиграет цвет</div></div>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => setComparison(!comparison)} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${comparison ? 'chip active' : 'btn-secondary'}`}><ArrowDownUp size={14} />Сравнение</button>
                </div>
              </div>
              <div className={`grid ${comparison ? 'md:grid-cols-2' : 'grid-cols-1'} gap-px bg-[#252b33] lg:flex-1`}>
                {comparison && <div className="min-h-[270px]">{visualizerContent(true)}</div>}
                <div className="min-h-[270px]">{visualizerContent(false)}</div>
              </div>
            </section>

          </div>

          <div className={`dashboard-column dashboard-column-center ${activeMobileTab !== 'Расчёт и подбор' ? 'hidden xl:flex' : ''}`}>
            <section className="dashboard-calculator panel p-4 sm:p-5">
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
                <label htmlFor="paint-product" className="mb-2 block text-[10px] font-semibold text-slate-500">КАТАЛОГ ЛАКОКРАСОЧНЫХ МАТЕРИАЛОВ</label>
                <div className="relative">
                  <select id="paint-product" value={paintProductId} onChange={(event) => {
                    const productId = event.target.value;
                    const product = paintProductsById.get(productId);
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
                    {[...new Set(paintProducts.map((product) => product.brand))].map((brand) => <optgroup key={brand} label={brand}>
                      {paintProducts.filter((product) => product.brand === brand).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
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
                    <span><strong className="text-slate-300">Фасовки:</strong> {selectedPaintPackageSizes ? selectedPaintPackageSizes.map((size) => `${size.toLocaleString('ru-RU')} л`).join(', ') : 'не подтверждены; уточнить у продавца'}</span>
                    <span><strong className="text-slate-300">Цена:</strong> {Number.isFinite(paintPricePerLiter) ? `${paintPricePerLiter.toLocaleString('ru-RU')} ₽/л` : 'не указана'}</span>
                  </div>
                  <label className="flex items-center gap-2 text-[10px] text-slate-500">
                    <span className="shrink-0">Ваша цена, ₽/л</span>
                    <input type="number" min="0" step="0.01" value={Number.isFinite(paintPricePerLiter) ? paintPricePerLiter : ''} onChange={(event) => {
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
                    ? <p className="text-[10px] text-slate-500">Расход для этой поверхности: {minimumLiters.toFixed(1).replace('.', ',')}–{liters.toFixed(1).replace('.', ',')} л на {layers} сл.</p>
                    : <p className="text-[10px] leading-relaxed text-amber-200/70">Нет отдельного расхода по выбранной поверхности; объём ниже рассчитан по общему ориентиру. Сверьте технический лист.</p>}
                  <a href={selectedPaintProduct.source} target="_blank" rel="noreferrer" className="inline-block text-[10px] text-[var(--primary-300)] underline decoration-[var(--primary-300)]/30 underline-offset-2 hover:decoration-[var(--primary-300)]">Данные производителя</a>
                </div>}
              </section>
              <div className="rounded-xl border border-[#303c2c] bg-[#141a14] p-3.5">
                <div className="flex items-center justify-between"><span className="text-xs text-slate-400">Необходимый объём</span><span className="font-['Manrope'] text-lg font-bold text-[var(--primary-100)]">{paintCoverage ? `${minimumLiters.toFixed(1).replace('.', ',')}–` : ''}{liters.toFixed(1).replace('.', ',')} л</span></div>
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
                      {clients.map((client) => <option key={client.id} value={client.id}>{client.name} · •••• {client.phoneLast4}</option>)}
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
            <section className={`dashboard-palettes panel min-h-0 p-4 sm:p-5 ${activeMobileTab !== 'Расчёт и подбор' ? 'hidden xl:flex' : ''}`} aria-label="Карточка подбора цветов">
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
                        <img src={visualSurfaces.find((item) => item.id === previewSurface)?.image ?? smoothWallImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
                        <span className={`absolute inset-0 mix-blend-multiply ${previewSurface === 'wall' ? 'opacity-75' : 'opacity-65'}`} style={{ backgroundColor: color.hex }} />
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
              <button aria-label="Закрыть каталог цветов" onClick={closeCatalog} className="catalog-close-button icon-button h-9 shrink-0 rounded-lg px-2 text-slate-400"><span className="catalog-close-label">Закрыть каталог</span><X size={18} className="catalog-close-icon" /></button>
            </div>
          </div>
          <div className="catalog-controls shrink-0">
          <section className="catalog-visual-controls mb-3 rounded-xl border border-[#2a313a] bg-[#0c1015] p-3" aria-label="Параметры предпросмотра">
            <div className="mb-2 flex items-center justify-between gap-2"><span className="eyebrow">ПОВЕРХНОСТЬ В ПРЕДПРОСМОТРЕ</span><span className="text-[9px] text-slate-600">Расход — в расчёте</span></div>
            <div className="grid grid-cols-3 gap-1.5">
              {visualSurfaces.filter((item) => !selectedPaintProduct || selectedPaintProduct.surfaces.includes(item.calculatorSurface)).map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => { setPreviewSurface(item.id); setSurface(item.calculatorSurface); }} className={`chip flex min-w-0 items-center justify-center gap-1 rounded-lg px-1 py-2 text-center text-[9px] font-semibold ${previewSurface === item.id ? 'active' : ''}`}><Icon size={12} className="shrink-0" /><span className="truncate">{item.label}</span></button>; })}
            </div>
            {previewSurface === 'wallpaper' && <p className="mt-1.5 text-[9px] leading-relaxed text-amber-200/70">Для расчёта обои оцениваются как гладкая стена; фактический расход зависит от фактуры.</p>}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[#252b33] pt-2">
              <div><div className="eyebrow mb-1.5">ЦВЕТОВАЯ ТЕМПЕРАТУРА</div><div className="flex gap-1.5">{temperatures.map((item) => <button key={item.value} onClick={() => setTemperature(item.value)} className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[10px] font-semibold transition ${temperature === item.value ? 'accent-selection' : 'border-[#2b323c] bg-[#14191f] text-slate-500 hover:text-slate-300'}`}><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.swatch }} />{item.value}K</button>)}</div></div>
              <span className="hidden items-center gap-1 text-[9px] text-slate-500 min-[1500px]:flex"><Lightbulb size={12} />Цвет зависит от освещения</span>
            </div>
          </section>
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

      {expandedColor && <div className="fixed inset-0 z-[80] flex min-h-[100dvh] w-screen flex-col justify-between overflow-hidden" style={{ backgroundColor: expandedColor.hex }}>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/65" />
        <div className="pointer-events-none absolute inset-0 border-[12px] border-black/5 sm:border-[20px]" />
        <section role="dialog" aria-modal="true" aria-labelledby="expanded-color-title" className="relative flex min-h-[100dvh] flex-col justify-between p-5 pt-[max(20px,env(safe-area-inset-top))] sm:p-8 sm:pt-[max(32px,env(safe-area-inset-top))]">
          <div className="flex items-start justify-between gap-4">
            <span className="rounded-full border border-white/20 bg-black/20 px-3 py-1.5 text-[10px] font-semibold tracking-[.12em] text-white/80 backdrop-blur">ПОЛНОЭКРАННЫЙ ОБРАЗЕЦ</span>
            <button autoFocus onClick={() => setExpandedColor(null)} aria-label="Закрыть полноэкранный образец" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/25 bg-black/25 text-white shadow-lg backdrop-blur transition hover:bg-black/45"><X size={19} /></button>
          </div>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8 text-center">
            <div className="max-w-3xl text-white drop-shadow-[0_2px_18px_rgba(0,0,0,0.55)]">
              <div className="text-[clamp(1rem,3vw,1.5rem)] font-semibold tracking-wide">{getCatalogLabel(expandedColor.catalog)}</div>
              <h2 id="expanded-color-title" className="mt-2 font-['Manrope'] text-[clamp(3rem,15vw,9rem)] font-extrabold leading-none tracking-[-.06em]">{expandedColor.code}</h2>
              <p className="mt-4 text-[clamp(1rem,4vw,2rem)] font-medium">{expandedColor.name_ru}</p>
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-2xl rounded-2xl border border-white/15 bg-black/35 p-4 text-white shadow-2xl backdrop-blur-xl sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div><span className="block text-[9px] font-bold tracking-[.14em] text-white/55">ЦИФРОВОЙ ОБРАЗЕЦ</span><span className="mt-0.5 block font-mono text-lg font-semibold">{expandedColor.hex}</span></div>
              <div className="flex items-center gap-2"><span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-semibold">LRV {expandedColor.lrv}%</span><span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-semibold">База {expandedColor.base}</span></div>
            </div>
            {expandedColor.hexEstimated && <p className="mt-3 text-[10px] leading-relaxed text-white/70">Экранный оттенок приблизительный; цвет зависит от дисплея и освещения. Перед покупкой проверьте веер и сделайте пробный выкрас.</p>}
            <button onClick={() => { selectColor(expandedColor); setExpandedColor(null); }} className="btn-primary mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold"><Check size={16} />Выбрать этот цвет</button>
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
              <div className="mb-3 flex items-center justify-between"><div className="eyebrow">КАРТОЧКИ КЛИЕНТОВ</div><span className="text-[10px] text-slate-500">{clients.length}</span></div>
              {clients.length > 0 && <div className="mb-3 grid gap-2">
                {clients.map((client) => {
                  const isActive = activeClientId === client.id;
                  return <button key={client.id} onClick={(event) => { clientCardTriggerRef.current = event.currentTarget; setActiveClientId(client.id); setClientCardId(client.id); setConfirmClientDeletion(false); }} aria-haspopup="dialog" className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${isActive ? 'accent-selection' : 'border-[#2b323c] bg-[#0d1117] hover:bg-[#181e25]'}`}>
                    <span className="accent-surface text-[var(--primary-300)] flex h-9 w-9 shrink-0 items-center justify-center rounded-full"><UserRound size={16} /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{client.name}</span><span className="mt-1 block text-[10px] text-slate-500">Телефон ···· {client.phoneLast4}</span></span>
                    {isActive && <Check size={14} className="text-[var(--primary-300)]" />}
                  </button>;
                })}
              </div>}
              <form onSubmit={addClient} className="subtle-panel space-y-3 p-3.5">
                <div className="text-xs font-semibold">{clients.length ? 'Добавить клиента' : 'Создать карточку клиента'}</div>
                <input value={clientNameInput} onChange={(event) => setClientNameInput(event.target.value)} autoComplete="name" placeholder="Имя клиента" aria-label="Имя клиента" className="field w-full rounded-lg px-3 py-2.5 text-xs" />
                <input value={clientPhoneInput} onChange={(event) => setClientPhoneInput(event.target.value)} type="tel" autoComplete="tel" inputMode="tel" placeholder="Номер телефона" aria-label="Номер телефона" className="field w-full rounded-lg px-3 py-2.5 text-xs" />
                <div className="text-[10px] leading-relaxed text-slate-500">В карточке и проекте сохраняются только имя и последние 4 цифры номера.</div>
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
                        <div className="mt-2 flex flex-wrap items-center gap-2"><BaseBadge base={item.base} /><span className="text-[10px] text-slate-500">{item.liters.toFixed(1).replace('.', ',')} л · {item.cans}</span></div>
                        {item.paintProduct && <div className="mt-1 text-[10px] text-slate-500">{item.paintProduct.brand} · {item.paintProduct.name}{Number.isFinite(item.paintProduct.pricePerLiter) ? ` · ${item.paintProduct.pricePerLiter.toLocaleString('ru-RU')} ₽/л` : ''}</div>}
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
            <div role="status" className={`mt-3 text-center text-[10px] ${persistenceError ? 'base-warning' : 'text-slate-600'}`}>{persistenceError ? 'Не удалось сохранить изменения на этом устройстве.' : 'Клиенты и проекты сохраняются на этом устройстве.'}</div>
            <div className="mt-2 text-center text-[10px] text-slate-600">В заказ попадут только имя клиента и последние 4 цифры телефона.</div>
          </div>
        </aside>
      </div>}
      {openedClientCard && <div className="fixed inset-0 z-[60] grid w-screen place-items-center p-4">
        <button aria-label="Закрыть карточку клиента" onClick={() => { setClientCardId(''); setConfirmClientDeletion(false); clientCardTriggerRef.current?.focus(); }} className="drawer-backdrop absolute inset-0" />
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
            <button ref={clientCardCloseRef} aria-label="Закрыть карточку клиента" onClick={() => { setClientCardId(''); setConfirmClientDeletion(false); clientCardTriggerRef.current?.focus(); }} className="icon-button h-9 w-9 shrink-0 rounded-lg text-slate-400"><X size={18} /></button>
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
                  <div className="mt-1 truncate text-[10px] text-slate-500">{item.zone} · {item.liters.toFixed(1).replace('.', ',')} л · {item.base ? `База ${item.base}` : 'Без базы'}</div>
                </div>
              </article>)}
            </div> : <div className="rounded-xl border border-dashed border-[#343b45] px-4 py-8 text-center text-xs text-slate-500">У клиента пока нет сохранённых проектов.</div>}
          </div>
          <div className="space-y-3 border-t border-[#252d37] p-4 sm:px-6">
            {confirmClientDeletion ? <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
              <p className="text-xs leading-relaxed text-slate-300">Удалить карточку «{openedClientCard.name}»? Вместе с ней будут удалены все её проекты ({openedClientProjects.length}). Это действие нельзя отменить.</p>
              <div className="mt-3 flex gap-2">
                <button onClick={deleteClient} className="flex-1 rounded-lg bg-rose-500/15 px-3 py-2.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/25">Удалить клиента и проекты</button>
                <button onClick={() => setConfirmClientDeletion(false)} className="btn-secondary rounded-lg px-4 py-2.5 text-xs font-semibold">Отмена</button>
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
              <td><span className="print-color-chip" style={{ backgroundColor: item.color.hex }} /> <strong>{item.color.code}</strong><br />{item.color.name_ru}<br /><span>{item.color.catalog} · {item.color.hex}</span>{item.paintProduct && <><br /><strong>{item.paintProduct.brand} · {item.paintProduct.name}</strong><br /><span>{item.paintProduct.baseSystem}</span>{item.paintProduct.availabilityNote && <><br /><span>{item.paintProduct.availabilityNote}</span></>}{Number.isFinite(item.paintProduct.pricePerLiter) && <><br /><span>{item.paintProduct.pricePerLiter.toLocaleString('ru-RU')} ₽/л · ориентировочно {(item.liters * item.paintProduct.pricePerLiter).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽</span></>}</>}</td>
              <td>{item.area ? `${item.area} м²` : '—'}<br />{item.layers ? `${item.layers} слоя` : 'слои не указаны'}<br />{surfaces.find((surfaceItem) => surfaceItem.id === item.surface)?.label ?? '—'}</td>
              <td>{item.base ? `База ${item.base}` : 'Без колеровочной базы'}</td>
              <td>{item.liters.toFixed(1).replace('.', ',')} л<br /><span>{item.cans}</span></td>
            </tr>)}</tbody>
          </table>
          <div className="print-totals">
            <strong>Итого материалов: {clientProjects.reduce((total, item) => total + item.liters, 0).toFixed(1).replace('.', ',')} л</strong>
            <span>База A: {clientProjects.filter((item) => item.base === 'A').reduce((total, item) => total + item.liters, 0).toFixed(1).replace('.', ',')} л · База C: {clientProjects.filter((item) => item.base === 'C').reduce((total, item) => total + item.liters, 0).toFixed(1).replace('.', ',')} л · Без базы: {clientProjects.filter((item) => !item.base).reduce((total, item) => total + item.liters, 0).toFixed(1).replace('.', ',')} л{projectCost > 0 ? ` · ориентировочная стоимость: ${projectCost.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽` : ''}</span>
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
            <div className="mb-8 flex items-center gap-3">
              <span className="brand-mark flex h-11 w-11 items-center justify-center rounded-2xl font-['Manrope'] text-xl font-extrabold">K</span>
              <span className="font-['Manrope'] text-lg font-extrabold tracking-tight">kolor<span className="lime">lab</span><span className="mt-0.5 block text-[9px] font-semibold tracking-[.18em] text-white/45">ЛАБОРАТОРИЯ ЦВЕТА</span></span>
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
