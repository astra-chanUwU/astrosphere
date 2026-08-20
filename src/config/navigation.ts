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

export const primaryNavigation: NavItem[] = [
  { href: "/spheres", label: "Explore" },
  { href: "/shelf", label: "Shelf" },
  { href: "/work", label: "Work" },
  { href: "/about", label: "About" },
];

export const utilityNavigation: NavItem[] = [
  { href: "/search", label: "Search", icon: "search" },
  { href: "https://waifulist.moe/list/5e1dfaf9-e381-472f-a232-ed6d0ddf2ece?sort=added", label: "Watchlist", external: true },
];

const withCurrent = (items: NavItem[], pathname: string) =>
  items.map((item) => ({ ...item, current: item.href === pathname }));

const archiveItems: NavItem[] = [
  { href: "/spheres", label: "Spheres" },
  { href: "/artifacts", label: "Artifacts" },
  { href: "/trails", label: "Trails" },
  { href: "/signals", label: "Signals" },
];

const archiveSidebar = (pathname: string): SidebarModel => ({
  heading: "Explore the archive",
  groups: [
    { items: withCurrent(archiveItems, pathname) },
    { label: "Elsewhere", items: [{ href: "/shelf", label: "Shelf" }, { href: "/search", label: "Search" }] },
  ],
});

const homeSidebar: SidebarModel = {
  heading: "Start exploring",
  groups: [{ items: [...archiveItems, { href: "/shelf", label: "Shelf" }] }],
};

const studioSidebar: SidebarModel = {
  heading: "Work with Astro",
  groups: [{ items: [{ href: "/work", label: "Work" }, { href: "/contact", label: "Contact" }, { href: "/support", label: "Support" }] }],
};

const aboutSidebar: SidebarModel = {
  heading: "About AstroSphere",
  groups: [{ items: [{ href: "/about", label: "About" }, { href: "/now", label: "Now" }, { href: "/colophon", label: "Colophon" }, { href: "/rss.xml", label: "RSS" }] }],
};

const mangaSidebar: SidebarModel = {
  heading: "Manga library",
  groups: [{ items: [{ href: "/shelf", label: "The Shelf", current: true }, { href: "/shelf/image-sets", label: "Image sets" }, { href: "/search", label: "Search the archive" }] }],
};

const recoverySidebar: SidebarModel = {
  heading: "Find your way",
  groups: [{ items: [{ href: "/", label: "Home" }, { href: "/spheres", label: "Explore" }, { href: "/search", label: "Search" }] }],
};

export const resolveSidebar = (pathname: string): SidebarModel => {
  if (pathname === "/") return homeSidebar;
  if (["/spheres", "/artifacts", "/trails", "/signals"].some((path) => pathname === path || pathname.startsWith(`${path}/page/`))) return archiveSidebar(pathname);
  if (pathname === "/shelf" || pathname.startsWith("/shelf/")) return mangaSidebar;
  if (["/work", "/contact", "/support"].includes(pathname)) return withCurrentGroups(studioSidebar, pathname);
  if (["/about", "/now", "/colophon"].includes(pathname)) return withCurrentGroups(aboutSidebar, pathname);
  return recoverySidebar;
};

const withCurrentGroups = (model: SidebarModel, pathname: string): SidebarModel => ({
  ...model,
  groups: model.groups.map((group) => ({ ...group, items: withCurrent(group.items, pathname) })),
});
