type PagefindResult = { url: string; excerpt: string; meta: { title?: string; kind?: string } };
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

const getResultKind = (result: PagefindResult) => result.meta.kind ?? result.url.split("/").filter(Boolean)[0]?.replace(/-/g, " ") ?? "archive entry";

const renderResults = (container: HTMLOListElement, results: PagefindResult[]) => {
  container.replaceChildren(...results.map((result) => {
    const item = document.createElement("li");
    const link = document.createElement("a");
    const kind = document.createElement("span");
    kind.className = "result-kind";
    const resultKind = getResultKind(result);
    kind.setAttribute("data-result-kind", resultKind);
    kind.textContent = resultKind;
    const title = document.createElement("span");
    title.className = "result-title";
    title.textContent = result.meta.title ?? result.url;
    const arrow = document.createElement("span");
    arrow.className = "result-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "↗";
    link.href = result.url;
    link.append(kind, title, arrow);
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
  const sphereOptions = root.querySelector<HTMLElement>("[data-sphere-options]");
  const tagSearch = root.querySelector<HTMLInputElement>("[data-tag-search]");
  const tagOptions = root.querySelector<HTMLElement>("[data-tag-options]");
  const selectedTagsContainer = root.querySelector<HTMLElement>("[data-selected-tags]");
  const clearFilters = root.querySelector<HTMLButtonElement>("[data-clear-filters]");
  const status = root.querySelector<HTMLElement>("[data-search-status]");
  const results = root.querySelector<HTMLOListElement>("[data-search-results]");
  const suggestions = root.querySelector<HTMLElement>("[data-search-suggestions]");
  const buttons = [...root.querySelectorAll<HTMLButtonElement>("[data-kind]")];
  const queryButtons = [...root.querySelectorAll<HTMLButtonElement>("[data-query]")];
  if (!input || !sphereOptions || !tagSearch || !tagOptions || !selectedTagsContainer || !clearFilters || !status || !results) return;

  const pagefind = await getPagefind();
  await pagefind.init();
  const availableFilters = await pagefind.filters();
  let selectedKind = "all";
  let selectedSphere = "";
  let selectedTags: string[] = [];

  const labelValue = (value: string) => value.replace(/-/g, " ");
  const setPressed = (buttons: HTMLButtonElement[], selected: string) => buttons.forEach((button) => button.setAttribute("aria-pressed", String((button.dataset.sphere ?? "") === selected)));
  const renderSpheres = () => {
    const values = Object.entries(availableFilters.sphere ?? {}).sort(([left], [right]) => left.localeCompare(right));
    sphereOptions.replaceChildren(...[{ value: "", count: 0 }, ...values.map(([value, count]) => ({ value, count }))].map(({ value, count }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.sphere = value;
      button.setAttribute("aria-pressed", String(value === selectedSphere));
      button.textContent = value ? `${labelValue(value)} · ${count}` : "all topics";
      return button;
    }));
  };
  const renderTags = () => {
    const query = tagSearch.value.trim().toLowerCase();
    const values = Object.entries(availableFilters.tag ?? {}).sort(([left, leftCount], [right, rightCount]) => rightCount - leftCount || left.localeCompare(right));
    const visible = values.filter(([value]) => !selectedTags.includes(value) && (!query || labelValue(value).toLowerCase().includes(query))).slice(0, query ? 16 : 10);
    tagOptions.replaceChildren(...visible.map(([value, count]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.tag = value;
      button.textContent = `${labelValue(value)} · ${count}`;
      return button;
    }));
    selectedTagsContainer.replaceChildren(...selectedTags.map((value) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.removeTag = value;
      button.textContent = `${labelValue(value)} ×`;
      return button;
    }));
  };
  renderSpheres();
  renderTags();

  const runSearch = async () => {
    status.textContent = "Searching…";
    const query = input.value.trim();
    const hasActiveFilters = selectedKind !== "all" || Boolean(selectedSphere) || selectedTags.length > 0;
    if (!query && !hasActiveFilters) {
      renderResults(results, []);
      if (suggestions) suggestions.hidden = false;
      status.textContent = "Type a search to explore the archive.";
      return;
    }
    if (suggestions) suggestions.hidden = true;
    const filters: Record<string, unknown> = {};
    if (selectedKind !== "all") filters.kind = selectedKind;
    if (selectedSphere) filters.sphere = selectedSphere;
    if (selectedTags.length) filters.tag = selectedTags;
    if (document.documentElement.dataset.sfw !== "off") filters.rating = { none: "explicit" };
    const search = await pagefind.debouncedSearch(query || null, { filters });
    if (!search) return;
    const entries = await Promise.all(search.results.slice(0, 40).map((result) => result.data()));
    renderResults(results, entries);
    status.textContent = `${search.results.length} result${search.results.length === 1 ? "" : "s"}${search.results.length > 40 ? "; showing first 40" : ""}.`;
    clearFilters.hidden = !(selectedKind !== "all" || selectedSphere || selectedTags.length);
  };

  refreshSearch = runSearch;
  input.addEventListener("input", () => void runSearch());
  buttons.forEach((button) => button.addEventListener("click", () => {
    selectedKind = button.dataset.kind ?? "all";
    buttons.forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    void runSearch();
  }));
  sphereOptions.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-sphere]");
    if (!button) return;
    selectedSphere = button.dataset.sphere ?? "";
    setPressed([...sphereOptions.querySelectorAll<HTMLButtonElement>("[data-sphere]")], selectedSphere);
    void runSearch();
  });
  tagOptions.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-tag]");
    if (!button || selectedTags.includes(button.dataset.tag ?? "")) return;
    selectedTags = [...selectedTags, button.dataset.tag ?? ""];
    renderTags();
    void runSearch();
  });
  selectedTagsContainer.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-remove-tag]");
    if (!button) return;
    selectedTags = selectedTags.filter((tag) => tag !== button.dataset.removeTag);
    renderTags();
    void runSearch();
  });
  tagSearch.addEventListener("input", renderTags);
  clearFilters.addEventListener("click", () => {
    selectedKind = "all";
    selectedSphere = "";
    selectedTags = [];
    buttons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.kind === "all")));
    tagSearch.value = "";
    renderSpheres();
    renderTags();
    void runSearch();
  });
  queryButtons.forEach((button) => button.addEventListener("click", () => {
    input.value = button.dataset.query ?? "";
    input.focus();
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
