type PagefindResult = { url: string; excerpt: string; meta: { title?: string } };
type PagefindSearch = {
  init: () => Promise<void>;
  filters: () => Promise<Record<string, Record<string, number>>>;
  debouncedSearch: (query: string | null, options: { filters: Record<string, unknown> }) => Promise<{ results: Array<{ data: () => Promise<PagefindResult> }> } | null>;
};
type PagefindWindow = Window & {
  __astrospherePagefind?: PagefindSearch;
  __astrospherePagefindError?: unknown;
};

let refreshSearch: (() => Promise<void>) | undefined;

const getPagefind = () => new Promise<PagefindSearch>((resolve, reject) => {
  const pagefindWindow = window as PagefindWindow;
  const finish = () => {
    if (pagefindWindow.__astrospherePagefind) resolve(pagefindWindow.__astrospherePagefind);
    else if (pagefindWindow.__astrospherePagefindError) reject(pagefindWindow.__astrospherePagefindError);
  };
  if (pagefindWindow.__astrospherePagefind || pagefindWindow.__astrospherePagefindError) finish();
  else window.addEventListener("astrosphere:pagefind-ready", finish, { once: true });
});

const populateSelect = (select: HTMLSelectElement, values: Record<string, number> | undefined, label: string) => {
  Object.keys(values ?? {}).sort().forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value.replace(/-/g, " ");
    select.append(option);
  });
  select.options[0].textContent = `all ${label}`;
};

const renderResults = (container: HTMLOListElement, results: PagefindResult[]) => {
  container.replaceChildren(...results.map((result) => {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = result.url;
    link.textContent = result.meta.title ?? result.url;
    const excerpt = document.createElement("p");
    excerpt.innerHTML = result.excerpt;
    item.append(link, excerpt);
    return item;
  }));
};

const setupSearch = async () => {
  const root = document.querySelector<HTMLElement>("[data-pagefind-search]");
  if (!root || root.dataset.ready === "true") return;
  root.dataset.ready = "true";

  const input = root.querySelector<HTMLInputElement>("[data-search-input]");
  const sphere = root.querySelector<HTMLSelectElement>("[data-sphere-filter]");
  const tag = root.querySelector<HTMLSelectElement>("[data-tag-filter]");
  const status = root.querySelector<HTMLElement>("[data-search-status]");
  const results = root.querySelector<HTMLOListElement>("[data-search-results]");
  const buttons = [...root.querySelectorAll<HTMLButtonElement>("[data-kind]")];
  if (!input || !sphere || !tag || !status || !results) return;

  const pagefind = await getPagefind();
  await pagefind.init();
  const availableFilters = await pagefind.filters();
  populateSelect(sphere, availableFilters.sphere, "spheres");
  populateSelect(tag, availableFilters.tag, "tags");
  let selectedKind = "all";

  const runSearch = async () => {
    status.textContent = "Searching…";
    const filters: Record<string, unknown> = {};
    if (selectedKind !== "all") filters.kind = selectedKind;
    if (sphere.value) filters.sphere = sphere.value;
    if (tag.value) filters.tag = tag.value;
    if (document.documentElement.dataset.sfw !== "off") filters.rating = { none: "explicit" };
    const search = await pagefind.debouncedSearch(input.value.trim() || null, { filters });
    if (!search) return;
    const entries = await Promise.all(search.results.slice(0, 40).map((result) => result.data()));
    renderResults(results, entries);
    status.textContent = `${search.results.length} result${search.results.length === 1 ? "" : "s"}${search.results.length > 40 ? "; showing first 40" : ""}.`;
  };

  refreshSearch = runSearch;
  input.addEventListener("input", () => void runSearch());
  sphere.addEventListener("change", () => void runSearch());
  tag.addEventListener("change", () => void runSearch());
  buttons.forEach((button) => button.addEventListener("click", () => {
    selectedKind = button.dataset.kind ?? "all";
    buttons.forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    void runSearch();
  }));
  await runSearch();
};

document.addEventListener("astro:page-load", () => void setupSearch().catch((error) => {
  console.error("AstroSphere search failed to load.", error);
  const root = document.querySelector<HTMLElement>("[data-pagefind-search]");
  const status = root?.querySelector<HTMLElement>("[data-search-status]");
  if (root) root.dataset.ready = "false";
  if (status) status.textContent = "The search index could not be loaded.";
}));
document.addEventListener("astrosphere:sfw-change", () => void refreshSearch?.());
