export function organizationSwitchPath(id: string, section: string) {
  if (section === '/organizations' || /^\/organizations\/[^/]+$/.test(section)) return `/organizations/${id}`
  const target = ['/campaigns', '/milestones', '/evidence']
    .find(path => section === path || section.startsWith(`${path}/`))
  return `/organizations/${id}/workspace${target ?? '/campaigns'}`
}
