import { isHed } from '../../lib/web3/deployment-context'

export function organizationSwitchPath(id: string, section: string) {
  if (section === '/organizations' || /^\/organizations\/[^/]+$/.test(section)) return `/organizations/${id}`
  if (isHed) return `/organizations/${id}/workspace/campaigns`
  const target = ['/campaigns', '/milestones', '/evidence']
    .find(path => section === path || section.startsWith(`${path}/`))
  return `/organizations/${id}/workspace${target ?? '/campaigns'}`
}
