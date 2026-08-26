export interface NavItem {
  href?: string;
  label: string;
  external?: boolean;
  icon?: "search";
  current?: boolean;
}

export interface SidebarGroup {
  label?: string;
  items: NavItem[];
}

export interface SidebarModel {
  heading: string;
  groups: SidebarGroup[];
}

export const isNavigationItemCurrent = (href: string, pathname: string): boolean =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

export const primaryNavigation: NavItem[] = [
  { href: "/explore", label: "Explore" },
  { href: "/anime", label: "Anime" },
  { href: "/manga", label: "Manga" },
  { href: "/doujinshi", label: "Doujinshi" },
  { href: "/image-sets", label: "Image-set" },
  { href: "/articles", label: "Articles" },
  { href: "/guides", label: "Guides" },
  { href: "/topics", label: "Topics" },
  { href: "/links", label: "Links" },
  { href: "/work", label: "Work" },
  { href: "/about", label: "About" },
];

export const utilityNavigation: NavItem[] = [
  { href: "/search", label: "Search", icon: "search" },
  { href: "https://waifulist.moe/list/5e1dfaf9-e381-472f-a232-ed6d0ddf2ece?sort=added", label: "Watchlist", external: true },
];

const withCurrent = (items: NavItem[], pathname: string) =>
  items.map((item) => ({
    ...item,
    current: item.href ? isNavigationItemCurrent(item.href, pathname) : false,
  }));

const archiveItems: NavItem[] = [
  { href: "/topics", label: "Topics" },
  { href: "/articles", label: "Articles" },
  { href: "/guides", label: "Guides" },
  { href: "/links", label: "Links" },
];

const archiveSidebar = (pathname: string): SidebarModel => ({
  heading: "Explore the archive",
  groups: [
    { items: withCurrent(archiveItems, pathname) },
    { label: "Elsewhere", items: [{ href: "/anime", label: "Anime" }, { href: "/manga", label: "Manga" }, { href: "/doujinshi", label: "Doujinshi" }, { href: "/image-sets", label: "Image-set" }, { href: "/search", label: "Search" }] },
  ],
});

const homeSidebar: SidebarModel = {
  heading: "Start exploring",
  groups: [{ items: [...archiveItems, { href: "/anime", label: "Anime" }, { href: "/manga", label: "Manga" }, { href: "/doujinshi", label: "Doujinshi" }, { href: "/image-sets", label: "Image-set" }] }],
};

const studioSidebar: SidebarModel = {
  heading: "Work with Astro",
  groups: [{ items: [{ href: "/work", label: "Work" }, { href: "/contact", label: "Contact" }, { href: "/support", label: "Support" }] }],
};

const aboutSidebar: SidebarModel = {
  heading: "About AstroSphere",
  groups: [{ items: [{ href: "/about", label: "About" }, { href: "/now", label: "Now" }, { href: "/colophon", label: "Colophon" }, { href: "/rss.xml", label: "RSS" }] }],
};

const librarySidebar = (pathname: string): SidebarModel => ({
  heading: "Reading archive",
  groups: [{ items: withCurrent([{ href: "/anime", label: "Anime" }, { href: "/manga", label: "Manga" }, { href: "/doujinshi", label: "Doujinshi" }, { href: "/image-sets", label: "Image-set" }, { href: "/search", label: "Search the archive" }], pathname) }],
});

const recoverySidebar: SidebarModel = {
  heading: "Find your way",
  groups: [{ items: [{ href: "/", label: "Home" }, { href: "/explore", label: "Explore" }, { href: "/search", label: "Search" }] }],
};

export const resolveSidebar = (pathname: string): SidebarModel => {
  if (pathname === "/") return homeSidebar;
  if (["/explore", "/topics", "/articles", "/guides", "/links"].some((path) => pathname === path || pathname.startsWith(`${path}/page/`))) return archiveSidebar(pathname);
  if (["/anime", "/manga", "/doujinshi", "/image-sets", "/shelf"].some((path) => pathname === path || pathname.startsWith(`${path}/page/`) || pathname.startsWith(`${path}/`))) return librarySidebar(pathname);
  if (["/work", "/contact", "/support"].includes(pathname)) return withCurrentGroups(studioSidebar, pathname);
  if (["/about", "/now", "/colophon"].includes(pathname)) return withCurrentGroups(aboutSidebar, pathname);
  return recoverySidebar;
};

const withCurrentGroups = (model: SidebarModel, pathname: string): SidebarModel => ({
  ...model,
  groups: model.groups.map((group) => ({ ...group, items: withCurrent(group.items, pathname) })),
});
