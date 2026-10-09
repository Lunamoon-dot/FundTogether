import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { advanceGetRefunds } from '../../../lib/api/generated/advance'
import type { AdvanceSnapshot } from '../../../lib/api/generated/advance'
import deployment from '../../../lib/web3/deployment-context'
import { getErrorMessage } from '../../../lib/api/error'
import { useAccountSession } from '../../auth/AccountSessionProvider'
import { AdvanceWalletAction } from './AdvanceWalletAction'
import { caseActionBlocked, chainDate, publicActionInput } from './advance-journey'

export function AdvanceCaseActions({ snapshot, metadataId, organizer = false, onRefresh }: { snapshot: AdvanceSnapshot; metadataId: string; organizer?: boolean; onRefresh: () => void }) {
  const { address } = useAccount(), { session } = useAccountSession(), c = snapshot.campaign, stage = snapshot.stages[Number(c.currentStage)]
  const [reason, setReason] = useState(''), [sources, setSources] = useState(''), [limits, setLimits] = useState(''), [disclosed, setDisclosed] = useState(false)
  const contributor = useQuery({ queryKey: ['advance-contributor', deployment.deploymentId, session?.userId, address, snapshot.campaignId], enabled: Boolean(session), retry: false,
    queryFn: ({ signal }) => advanceGetRefunds(snapshot.campaignId, { signal }), refetchInterval: 5000 })
  const submission = stage.submissions.find(v => v.version === stage.latestVersion)
  if (!submission || !['CHALLENGE_WINDOW', 'CASE_OPEN'].includes(c.state)) return null
  const action = c.state === 'CHALLENGE_WINDOW' ? 'OPEN_CASE' : organizer ? 'SUBMIT_CASE_RESPONSE' : 'ADD_CASE_MATERIAL'
  const amount = contributor.data?.items.find(v => v.wallet.toLowerCase() === address?.toLowerCase())?.contribution ?? '0'
  const blocked = caseActionBlocked(snapshot, action, { contribution: amount,
    resolver: Boolean(session?.roles.includes('RESOLVER') && address?.toLowerCase() === deployment.resolver.toLowerCase()),
    organizer: organizer && address?.toLowerCase() === c.organizer.toLowerCase() })
  const incomplete = !reason.trim() || !sources.trim() || !limits.trim() || !disclosed
  return <section className="panel advance-plan-form"><h2>{action === 'OPEN_CASE' ? 'Phản đối theo hồ sơ hiện tại' : action === 'SUBMIT_CASE_RESPONSE' ? 'Phản hồi của tổ chức' : 'Bổ sung thông tin cho case'}</h2>
    <p>Đợt {Number(c.currentStage) + 1}, version {stage.latestVersion}. Hạn: {chainDate(action === 'OPEN_CASE' ? stage.challengeEnd : submission.challengeCase.responseEnd)}.</p>
    <p>Mỗi version có một case. Hash file đúng vẫn có thể chứa thông tin sai; nêu căn cứ và điểm cần xác minh. Không đưa PII vào nội dung công khai.</p>
    {contributor.isError && <p role="alert">Không kiểm tra được contribution: {getErrorMessage(contributor.error)}</p>}
    {blocked && <p>{blocked}</p>}
    <label>Lý do và nội dung<textarea value={reason} onChange={e => setReason(e.target.value)} /></label>
    <label>Nguồn kiểm tra · mỗi dòng một nguồn<textarea value={sources} onChange={e => setSources(e.target.value)} /></label>
    <label>Giới hạn thông tin<textarea value={limits} onChange={e => setLimits(e.target.value)} /></label>
    <div className="advance-checks"><label><input type="checkbox" checked={disclosed} onChange={e => setDisclosed(e.target.checked)} />Tôi đồng ý công khai nội dung đã loại dữ liệu nhạy cảm.</label></div>
    <AdvanceWalletAction metadataId={metadataId} label={action === 'OPEN_CASE' ? 'Mở case' : action === 'SUBMIT_CASE_RESPONSE' ? 'Nộp phản hồi' : 'Nộp thông tin bổ sung'}
      requiredWallet={action === 'SUBMIT_CASE_RESPONSE' ? c.organizer : undefined} disabledReason={contributor.isError ? 'Chưa kiểm tra được quyền đóng góp.' : blocked ?? (incomplete ? 'Điền nguồn, nội dung, giới hạn và xác nhận công khai.' : undefined)}
      input={{ ...publicActionInput(snapshot, action), evidenceRef: { campaignId: snapshot.campaignId, stage: c.currentStage, version: stage.latestVersion, evidenceHash: submission.evidenceHash },
        statement: { reason, sources: sources.split('\n').map(v => v.trim()).filter(Boolean), limits, publicDisclosureConfirmed: true } }} display={{ snapshot }} onRefresh={onRefresh} />
  </section>
}
