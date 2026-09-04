import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ProjectIntegrity, ProjectRepairResult } from '../../../shared/ipc'

type HealthState = 'idle' | 'loading' | 'healthy' | 'warning' | 'error'

function issueCount(report: ProjectIntegrity): number {
  return report.warnings.length + report.missingFiles.length + report.invalidSourceFiles.length + report.danglingRelations + report.danglingTimelineEntityRefs + report.danglingTimelineChapterRefs + report.staleEmbeddings + report.danglingEmbeddings + report.invalidStoryArtifacts
}

export function ProjectHealthPanel({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<HealthState>('idle')
  const [report, setReport] = useState<ProjectIntegrity | null>(null)
  const [repair, setRepair] = useState<ProjectRepairResult | null>(null)
  const [message, setMessage] = useState('')

  const check = async (announce = true) => {
    setState('loading')
    setMessage(announce ? '正在检查项目完整性…' : '')
    setRepair(null)
    try {
      const result = await window.novelAPI.project.checkIntegrity()
      if (!result.ok) {
        setState('error')
        setMessage(`检查失败：${result.error.message}`)
        return
      }
      setReport(result.data)
      setState(issueCount(result.data) === 0 ? 'healthy' : 'warning')
      setMessage(issueCount(result.data) === 0 ? '项目完整性正常。' : `发现 ${issueCount(result.data)} 项需要关注的问题。`)
    } catch (error) {
      setState('error')
      setMessage(`检查失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  useEffect(() => {
    void check(false)
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const repairIndexes = async () => {
    setState('loading')
    setMessage('正在修复可重建索引…')
    try {
      const result = await window.novelAPI.project.repairIndexes()
      if (!result.ok) {
        setState('error')
        setMessage(`修复失败：${result.error.message}`)
        return
      }
      setRepair(result.data)
      await check(false)
      setMessage(`修复完成：${result.data.documents} 章、${result.data.entities} 个实体、${result.data.relations} 条关系${result.data.restoredSources.length ? `；恢复源文件 ${result.data.restoredSources.length} 个` : ''}。`)
    } catch (error) {
      setState('error')
      setMessage(`修复失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const issues = report ? issueCount(report) : 0
  return <div className="health-overlay" role="dialog" aria-modal="true" aria-label="项目完整性" onClick={onClose}>
    <section className="health-panel" onClick={(event) => event.stopPropagation()}>
      <header><div className="health-heading"><span className="health-heading-icon"><ShieldCheck size={17} /></span><div><b>项目完整性</b><small>检查索引、引用与可恢复源文件</small></div></div><button className="health-close" type="button" onClick={onClose} aria-label="关闭项目完整性" title="关闭（Esc）"><X size={16} /></button></header>
      <div className="health-body">
        <div className={`health-summary ${state}`}>
          {state === 'loading' ? <Loader2 className="spin" size={18} /> : state === 'healthy' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <div><b>{state === 'loading' ? '检查中…' : state === 'healthy' ? '项目状态正常' : state === 'warning' ? `发现 ${issues} 项问题` : state === 'error' ? '检查失败' : '尚未检查'}</b><small>{message}</small></div>
        </div>
        {report && <>
          <div className="health-counts">
            <div><b>{report.chaptersIndexed}/{report.chaptersOnDisk}</b><small>章节索引</small></div>
            <div><b>{report.entitiesIndexed}/{report.entitiesOnDisk}</b><small>实体索引</small></div>
            <div><b>{report.relationsIndexed}</b><small>关系</small></div>
            <div><b>{report.factsIndexed}</b><small>Canon facts</small></div>
            <div><b>{report.assetsIndexed}/{report.assetsOnDisk}</b><small>图片资产</small></div>
            <div><b>{report.embeddingRows}</b><small>Embedding 索引</small></div>
            <div><b>{report.invalidStoryArtifacts}</b><small>无效设定</small></div>
          </div>
          <div className="health-migration"><b>数据库 schema</b><span>v{report.migration.fromVersion} → v{report.migration.toVersion}</span><small>{report.migration.status === 'migrated' ? `本次应用 ${report.migration.applied.length} 个迁移` : '数据库 schema 已是最新'}</small></div>
          {(report.missingFiles.length > 0 || report.invalidSourceFiles.length > 0 || report.warnings.length > 0) && <div className="health-issues"><b>需要关注</b>{report.missingFiles.map((file) => <div key={`missing-${file}`}>缺少源文件：{file}</div>)}{report.invalidSourceFiles.map((file) => <div key={`invalid-source-${file}`}>源文件 schema 无效：{file}</div>)}{report.warnings.map((warning) => <div key={warning}>{warning}</div>)}</div>}
          {(report.danglingRelations > 0 || report.danglingTimelineEntityRefs > 0 || report.danglingTimelineChapterRefs > 0) && <div className="health-issues"><b>悬空引用</b>{report.danglingRelations > 0 && <div>关系：{report.danglingRelations} 条</div>}{report.danglingTimelineEntityRefs > 0 && <div>时间线实体：{report.danglingTimelineEntityRefs} 条</div>}{report.danglingTimelineChapterRefs > 0 && <div>时间线章节：{report.danglingTimelineChapterRefs} 条</div>}</div>}
          {(report.staleEmbeddings > 0 || report.danglingEmbeddings > 0) && <div className="health-issues"><b>Embedding 索引</b>{report.staleEmbeddings > 0 && <div>过期向量：{report.staleEmbeddings} 条（章节内容已变化）</div>}{report.danglingEmbeddings > 0 && <div>悬空向量：{report.danglingEmbeddings} 条（章节源已不存在）</div>}</div>}
          {repair && <div className="health-repair-result"><b>最近一次修复</b><small>重建 {repair.documents} 章、{repair.entities} 个实体、{repair.timeline} 个事件、{repair.relations} 条关系、{repair.assets} 个资产</small>{repair.embeddingsRemoved > 0 && <small>清理失效 Embedding：{repair.embeddingsRemoved} 条；下次 Context 构建时按需重建</small>}{repair.restoredSources.length > 0 && <small>恢复源文件：{repair.restoredSources.join('、')}</small>}{repair.invalidStoryArtifacts > 0 && <small>保留无效设定：{repair.invalidStoryArtifacts} 条，未静默改写</small>}{repair.invalidSourceFiles.length > 0 && <small>保留无效源文件：{repair.invalidSourceFiles.join('、')}</small>}</div>}
        </>}
      </div>
      <footer><div className="health-actions">{report && issues > 0 && <button type="button" className="health-primary" onClick={() => void repairIndexes()} disabled={state === 'loading'}><ShieldCheck size={14} /> 修复索引</button>}<button type="button" className="health-secondary" onClick={() => void check()} disabled={state === 'loading'}><RefreshCw size={14} className={state === 'loading' ? 'spin' : undefined} /> 重新检查</button></div><small><ShieldCheck size={12} /> 只重建 SQLite 索引，不修改正文、Canon、Revision 或 Workflow 历史。</small></footer>
    </section>
  </div>
}
