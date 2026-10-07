import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, ChevronRight, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useTeacherStore } from '@/store/teacherStore';
import { useAuthStore } from '@/store/authStore';
import { useLogStore } from '@/store/logStore';
import { formatDate, formatDateTime } from '@/lib/utils';
import { SessionEvaluationForm } from './SessionEvaluationForm';
import { EvaluationDetails } from './EvaluationDetails';
import type {
  ComplaintStatus, ImprovementPlanStatus, RecommendationCategory, RecommendationStatus,
} from '@/lib/types';

const COMPLAINT_STATUSES: ComplaintStatus[] = [
  'open', 'under_review', 'resolved', 'closed',
];

const COMPLAINT_STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700',
  under_review: 'bg-amber-100 text-amber-700',
  investigating: 'bg-orange-100 text-orange-700',
  decision_made: 'bg-purple-100 text-purple-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-gray-100 text-gray-700',
};

const REC_CATEGORIES: RecommendationCategory[] = [
  'promotion', 'salary_increase', 'warning', 'training_required',
  'mentorship_required', 'performance_review', 'contract_review',
];

const REC_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  completed: 'bg-blue-100 text-blue-700',
};

export function ActionCenterPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as 'ar' | 'en';
  const {
    teachers, evaluations, complaints, improvementPlans, recommendations, adminNotes,
    addComplaint, advanceComplaintStatus,
    addImprovementPlan, updateImprovementPlan,
    addRecommendation, updateRecommendationStatus,
    addAdminNote,
    deleteEvaluation, deleteComplaint, deleteImprovementPlan, deleteRecommendation, deleteAdminNote,
  } = useTeacherStore();
  const { currentUser } = useAuthStore();
  const { addLog } = useLogStore();

  const activeTeachers = teachers.filter((t) => !t.isDeleted);
  const getTeacherName = (id: string) => activeTeachers.find((t) => t.id === id)?.fullName || id;

  // Only admin-level users can delete (matches the DB RLS policy).
  const canDelete = currentUser?.role === 'super_admin' || currentUser?.role === 'admin';

  type DeleteKind = 'evaluation' | 'complaint' | 'plan' | 'recommendation' | 'note';
  const [deleteTarget, setDeleteTarget] = useState<{ kind: DeleteKind; id: string } | null>(null);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { kind, id } = deleteTarget;
    try {
      if (kind === 'evaluation') await deleteEvaluation(id);
      else if (kind === 'complaint') await deleteComplaint(id);
      else if (kind === 'plan') await deleteImprovementPlan(id);
      else if (kind === 'recommendation') await deleteRecommendation(id);
      else if (kind === 'note') await deleteAdminNote(id);
    } catch (err) {
      alert(err instanceof Error ? err.message : (lang === 'ar' ? 'فشل الحذف' : 'Delete failed'));
    } finally {
      setDeleteTarget(null);
    }
  };

  // Small icon-only delete button shown on each row for admin-level users.
  const DeleteBtn = ({ kind, id }: { kind: DeleteKind; id: string }) =>
    canDelete ? (
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-red-500 hover:bg-red-50 shrink-0"
        aria-label={lang === 'ar' ? 'حذف' : 'Delete'}
        onClick={() => setDeleteTarget({ kind, id })}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    ) : null;

  // Evaluation form
  const [evalOpen, setEvalOpen] = useState(false);

  // Complaint
  const [complaintOpen, setComplaintOpen] = useState(false);
  const [complaintForm, setComplaintForm] = useState({ teacherId: '', description: '' });
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [advanceId, setAdvanceId] = useState('');
  const [advanceStatus, setAdvanceStatus] = useState<ComplaintStatus>('under_review');
  const [advanceNote, setAdvanceNote] = useState('');

  // Plan
  const [planOpen, setPlanOpen] = useState(false);
  const [planForm, setPlanForm] = useState({ teacherId: '', issue: '', goal: '', actionSteps: '', targetDate: '', followUpDate: '' });

  // Recommendation
  const [recOpen, setRecOpen] = useState(false);
  const [recForm, setRecForm] = useState({ teacherId: '', category: 'promotion' as RecommendationCategory, content: '' });

  // Note
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteForm, setNoteForm] = useState({ teacherId: '', content: '' });

  const TeacherSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder={t('common.teacher')} /></SelectTrigger>
      <SelectContent>
        {activeTeachers.map((tc) => <SelectItem key={tc.id} value={tc.id}>{tc.fullName}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  const handleAddComplaint = (e: React.FormEvent) => {
    e.preventDefault();
    addComplaint({ teacherId: complaintForm.teacherId, reportedBy: currentUser?.name || '', description: complaintForm.description, status: 'open', priority: 'medium' });
    setComplaintOpen(false);
    setComplaintForm({ teacherId: '', description: '' });
  };

  const handleAdvanceComplaint = (e: React.FormEvent) => {
    e.preventDefault();
    advanceComplaintStatus(advanceId, advanceStatus, advanceNote, currentUser?.name || '');
    if (currentUser) {
      addLog({ userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role, action: 'update_complaint', target: 'شكوى', details: `تحديث حالة الشكوى إلى: ${t(`complaint.${advanceStatus}`)}` });
    }
    setAdvanceOpen(false);
    setAdvanceNote('');
  };

  const handleAddPlan = (e: React.FormEvent) => {
    e.preventDefault();
    addImprovementPlan({ ...planForm, createdBy: currentUser?.name || '', status: 'open' });
    setPlanOpen(false);
    setPlanForm({ teacherId: '', issue: '', goal: '', actionSteps: '', targetDate: '', followUpDate: '' });
  };

  const handleAddRec = (e: React.FormEvent) => {
    e.preventDefault();
    addRecommendation({ teacherId: recForm.teacherId, createdBy: currentUser?.name || '', category: recForm.category, content: recForm.content, status: 'pending' });
    setRecOpen(false);
    setRecForm({ teacherId: '', category: 'promotion', content: '' });
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    addAdminNote({ teacherId: noteForm.teacherId, createdBy: currentUser?.name || '', content: noteForm.content });
    setNoteOpen(false);
    setNoteForm({ teacherId: '', content: '' });
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-[#1F2937]">{t('actionCenter.title')}</h1>

      <Tabs defaultValue="evaluations">
        <TabsList className="bg-gray-100 flex-wrap h-auto gap-1">
          {[
            { value: 'evaluations', label: t('evaluation.title') },
            { value: 'complaints', label: t('complaint.title') },
            { value: 'plans', label: t('plan.title') },
            { value: 'recommendations', label: t('recommendation.title') },
            { value: 'notes', label: t('teachers.adminNotes') },
          ].map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Evaluations */}
        <TabsContent value="evaluations" className="mt-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base">{t('evaluation.title')}</CardTitle>
              <Button size="sm" onClick={() => setEvalOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                <Plus className="h-4 w-4 me-1" />{t('evaluation.addEvaluation')}
              </Button>
            </CardHeader>
            <CardContent>
              {evaluations.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">{t('evaluation.noEvaluations')}</p>
              ) : (
                <div className="space-y-3">
                  {evaluations.slice(0, 20).map((ev) => (
                    /* The card is now the OUTER element, with the summary
                       line and the expandable details stacked inside it, so an
                       expanded panel sits inside the same rounded card rather
                       than beside the badges. */
                    <div key={ev.id} data-testid={`evaluation-row-${ev.id}`} className="p-3 bg-gray-50 rounded-lg">
                     {/* items-start, not items-center: the row grows when a
                         general comment is present, and the badges must stay
                         beside the teacher's name rather than drifting to the
                         vertical middle of a three-line card. */}
                     <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800">{getTeacherName(ev.teacherId)}</p>
                        {/* GENERAL COMMENT, immediately under the teacher's
                            name — what a supervisor looking back at a lesson
                            reads first. Deliberately understated (small,
                            muted, italic, capped at three lines) so it informs
                            the row without dominating it; the full text is in
                            the title attribute.

                            Rendered only when there is one. An evaluation
                            created before this field was used simply shows
                            nothing here — no placeholder, and never an
                            invented comment. */}
                        {ev.customNote?.trim() && (
                          <p
                            data-testid={`evaluation-general-comment-${ev.id}`}
                            title={ev.customNote.trim()}
                            className="text-xs italic text-gray-600 mt-0.5 whitespace-pre-line line-clamp-3 break-words"
                          >
                            {ev.customNote.trim()}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mt-0.5">{ev.evaluatorName} · {formatDate(ev.sessionDate, lang)}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge className={
                          ev.grade === 'excellent' ? 'bg-emerald-100 text-emerald-700' :
                          ev.grade === 'good' ? 'bg-blue-100 text-blue-700' :
                          ev.grade === 'average' ? 'bg-amber-100 text-amber-700' :
                          ev.grade === 'weak' ? 'bg-orange-100 text-orange-700' :
                          'bg-red-100 text-red-700'
                        }>{t(`evaluation.${ev.grade}`)}</Badge>
                        <Badge className="bg-primary text-primary-foreground">{ev.overallScore}</Badge>
                        <DeleteBtn kind="evaluation" id={ev.id} />
                      </div>
                     </div>

                      {/* READ-ONLY read-back of the nine criteria.
                          Mounted only for a 9-criteria evaluation. A
                          historical one (criteria === null) gets no control
                          and no panel: it has no 9-criterion data, and the
                          honest thing is to offer nothing rather than an empty
                          section or nine invented ratings. Its own summary
                          line — score, grade, evaluator, date, and its general
                          comment if it has one — is unchanged. */}
                      {ev.criteria && (
                        <EvaluationDetails criteria={ev.criteria} evaluationId={ev.id} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Complaints */}
        <TabsContent value="complaints" className="mt-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base">{t('complaint.title')}</CardTitle>
              <Button size="sm" onClick={() => setComplaintOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                <Plus className="h-4 w-4 me-1" />{t('complaint.addComplaint')}
              </Button>
            </CardHeader>
            <CardContent>
              {complaints.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">{t('complaint.noComplaints')}</p>
              ) : (
                <div className="space-y-3">
                  {complaints.map((c) => (
                    <div key={c.id} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800">{getTeacherName(c.teacherId)}</p>
                          <p className="text-xs text-gray-600 mt-0.5">{c.description}</p>
                          <p className="text-xs text-gray-400 mt-1">{c.reportedBy} · {formatDate(c.createdAt, lang)}</p>
                          {/* Workflow steps */}
                          <div className="flex flex-wrap gap-1 mt-2">
                            {COMPLAINT_STATUSES.map((s, i) => (
                              <div key={s} className="flex items-center gap-0.5">
                                <span className={`text-xs px-1.5 py-0.5 rounded ${c.status === s ? COMPLAINT_STATUS_COLORS[s] : 'bg-gray-100 text-gray-400'}`}>
                                  {t(`complaint.${s}`)}
                                </span>
                                {i < COMPLAINT_STATUSES.length - 1 && <ChevronRight className="h-3 w-3 text-gray-300" />}
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className={COMPLAINT_STATUS_COLORS[c.status]}>
                              {t(`complaint.${c.status}`)}
                            </Badge>
                            <DeleteBtn kind="complaint" id={c.id} />
                          </div>
                          {c.status !== 'closed' && (
                            <Button
                              variant="ghost" size="sm"
                              className="h-6 text-xs text-primary hover:bg-primary/10 px-2"
                              onClick={() => { setAdvanceId(c.id); setAdvanceOpen(true); }}
                            >
                              {t('complaint.advanceStatus')}
                            </Button>
                          )}
                        </div>
                      </div>
                      {c.actions.length > 1 && (
                        <div className="mt-2 space-y-1 border-t pt-2">
                          {c.actions.slice(1).map((a) => (
                            <p key={a.id} className="text-xs text-gray-500">
                              <span className="font-medium">{a.byUser}</span>: {a.note} · {formatDateTime(a.timestamp, lang)}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Improvement Plans */}
        <TabsContent value="plans" className="mt-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base">{t('plan.title')}</CardTitle>
              <Button size="sm" onClick={() => setPlanOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                <Plus className="h-4 w-4 me-1" />{t('plan.addPlan')}
              </Button>
            </CardHeader>
            <CardContent>
              {improvementPlans.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">{t('plan.noPlans')}</p>
              ) : (
                <div className="space-y-3">
                  {improvementPlans.map((plan) => (
                    <div key={plan.id} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800">{getTeacherName(plan.teacherId)}</p>
                          <p className="text-xs font-medium text-primary mt-0.5">{plan.issue}</p>
                          <p className="text-xs text-gray-500">{t('plan.goal')}: {plan.goal}</p>
                          {plan.actionSteps && <p className="text-xs text-gray-500 mt-0.5">{plan.actionSteps}</p>}
                          <p className="text-xs text-gray-400 mt-1">
                            {t('plan.targetDate')}: {formatDate(plan.targetDate, lang)}
                            {plan.followUpDate && ` · ${t('plan.followUpDate')}: ${formatDate(plan.followUpDate, lang)}`}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className={
                              plan.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                              plan.status === 'failed' ? 'bg-red-100 text-red-700' :
                              plan.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                              'bg-amber-100 text-amber-700'
                            }>{t(`plan.${plan.status}`)}</Badge>
                            <DeleteBtn kind="plan" id={plan.id} />
                          </div>
                          {plan.status === 'open' && (
                            <Button variant="ghost" size="sm" className="h-6 text-xs px-2 text-blue-600" onClick={() => updateImprovementPlan(plan.id, { status: 'in_progress' as ImprovementPlanStatus })}>
                              {t('plan.in_progress')}
                            </Button>
                          )}
                          {plan.status === 'in_progress' && (
                            <Button variant="ghost" size="sm" className="h-6 text-xs px-2 text-emerald-600" onClick={() => updateImprovementPlan(plan.id, { status: 'completed' as ImprovementPlanStatus })}>
                              {t('plan.completed')}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recommendations */}
        <TabsContent value="recommendations" className="mt-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base">{t('recommendation.title')}</CardTitle>
              <Button size="sm" onClick={() => setRecOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                <Plus className="h-4 w-4 me-1" />{t('recommendation.addRecommendation')}
              </Button>
            </CardHeader>
            <CardContent>
              {recommendations.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">{t('recommendation.noRecommendations')}</p>
              ) : (
                <div className="space-y-3">
                  {recommendations.map((rec) => (
                    <div key={rec.id} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs">{t(`recommendation.${rec.category}`)}</Badge>
                            <span className="text-sm font-medium text-gray-800">{getTeacherName(rec.teacherId)}</span>
                          </div>
                          <p className="text-xs text-gray-600">{rec.content}</p>
                          <p className="text-xs text-gray-400 mt-1">{rec.createdBy} · {formatDate(rec.createdAt, lang)}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <div className="flex items-center gap-1">
                            <Badge className={REC_STATUS_COLORS[rec.status]}>{t(`recommendation.${rec.status}`)}</Badge>
                            <DeleteBtn kind="recommendation" id={rec.id} />
                          </div>
                          {rec.status === 'pending' && (
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" className="h-6 text-xs px-1.5 text-emerald-600" onClick={() => updateRecommendationStatus(rec.id, 'approved' as RecommendationStatus)}>
                                {t('recommendation.approved')}
                              </Button>
                              <Button variant="ghost" size="sm" className="h-6 text-xs px-1.5 text-red-500" onClick={() => updateRecommendationStatus(rec.id, 'rejected' as RecommendationStatus)}>
                                {t('recommendation.rejected')}
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Admin Notes */}
        <TabsContent value="notes" className="mt-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base">{t('teachers.adminNotes')}</CardTitle>
              <Button size="sm" onClick={() => setNoteOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                <Plus className="h-4 w-4 me-1" />إضافة ملاحظة
              </Button>
            </CardHeader>
            <CardContent>
              {adminNotes.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">{t('common.noData')}</p>
              ) : (
                <div className="space-y-3">
                  {adminNotes.map((note) => (
                    <div key={note.id} className="p-3 bg-gray-50 rounded-lg flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800">{getTeacherName(note.teacherId)}</p>
                        <p className="text-xs text-gray-600 mt-0.5">{note.content}</p>
                        <p className="text-xs text-gray-400 mt-1">{note.createdBy} · {formatDateTime(note.createdAt, lang)}</p>
                      </div>
                      <DeleteBtn kind="note" id={note.id} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Session Evaluation Dialog */}
      <Dialog open={evalOpen} onOpenChange={(o) => !o && setEvalOpen(false)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-primary">{t('evaluation.addEvaluation')}</DialogTitle>
          </DialogHeader>
          <SessionEvaluationForm onClose={() => setEvalOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Complaint Dialog */}
      <Dialog open={complaintOpen} onOpenChange={setComplaintOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-primary">{t('complaint.addComplaint')}</DialogTitle></DialogHeader>
          <form onSubmit={handleAddComplaint} className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t('common.teacher')} *</Label>
              <TeacherSelect value={complaintForm.teacherId} onChange={(v) => setComplaintForm((f) => ({ ...f, teacherId: v }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('complaint.description')} *</Label>
              <Textarea value={complaintForm.description} onChange={(e) => setComplaintForm((f) => ({ ...f, description: e.target.value }))} rows={3} required />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setComplaintOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={!complaintForm.teacherId} className="bg-primary hover:bg-primary/90 text-primary-foreground">{t('common.save')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Advance Complaint Status Dialog */}
      <Dialog open={advanceOpen} onOpenChange={setAdvanceOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-primary">{t('complaint.advanceStatus')}</DialogTitle></DialogHeader>
          <form onSubmit={handleAdvanceComplaint} className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t('complaint.status')} *</Label>
              <Select value={advanceStatus} onValueChange={(v) => setAdvanceStatus(v as ComplaintStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COMPLAINT_STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`complaint.${s}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('complaint.addNote')} *</Label>
              <Textarea value={advanceNote} onChange={(e) => setAdvanceNote(e.target.value)} rows={3} required />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setAdvanceOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground">{t('common.save')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Plan Dialog */}
      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-primary">{t('plan.addPlan')}</DialogTitle></DialogHeader>
          <form onSubmit={handleAddPlan} className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t('common.teacher')} *</Label>
              <TeacherSelect value={planForm.teacherId} onChange={(v) => setPlanForm((f) => ({ ...f, teacherId: v }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('plan.issue')} *</Label>
              <Input value={planForm.issue} onChange={(e) => setPlanForm((f) => ({ ...f, issue: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label>{t('plan.goal')} *</Label>
              <Input value={planForm.goal} onChange={(e) => setPlanForm((f) => ({ ...f, goal: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label>{t('plan.actionSteps')}</Label>
              <Textarea value={planForm.actionSteps} onChange={(e) => setPlanForm((f) => ({ ...f, actionSteps: e.target.value }))} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('plan.targetDate')} *</Label>
                <Input type="date" value={planForm.targetDate} onChange={(e) => setPlanForm((f) => ({ ...f, targetDate: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label>{t('plan.followUpDate')}</Label>
                <Input type="date" value={planForm.followUpDate} onChange={(e) => setPlanForm((f) => ({ ...f, followUpDate: e.target.value }))} />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setPlanOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={!planForm.teacherId} className="bg-primary hover:bg-primary/90 text-primary-foreground">{t('common.save')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Recommendation Dialog */}
      <Dialog open={recOpen} onOpenChange={setRecOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-primary">{t('recommendation.addRecommendation')}</DialogTitle></DialogHeader>
          <form onSubmit={handleAddRec} className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t('common.teacher')} *</Label>
              <TeacherSelect value={recForm.teacherId} onChange={(v) => setRecForm((f) => ({ ...f, teacherId: v }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('recommendation.category')} *</Label>
              <Select value={recForm.category} onValueChange={(v) => setRecForm((f) => ({ ...f, category: v as RecommendationCategory }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REC_CATEGORIES.map((cat) => <SelectItem key={cat} value={cat}>{t(`recommendation.${cat}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('recommendation.content')} *</Label>
              <Textarea value={recForm.content} onChange={(e) => setRecForm((f) => ({ ...f, content: e.target.value }))} rows={3} required />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setRecOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={!recForm.teacherId} className="bg-primary hover:bg-primary/90 text-primary-foreground">{t('common.save')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Note Dialog */}
      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-primary">إضافة ملاحظة إدارية</DialogTitle></DialogHeader>
          <form onSubmit={handleAddNote} className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t('common.teacher')} *</Label>
              <TeacherSelect value={noteForm.teacherId} onChange={(v) => setNoteForm((f) => ({ ...f, teacherId: v }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('common.notes')} *</Label>
              <Textarea value={noteForm.content} onChange={(e) => setNoteForm((f) => ({ ...f, content: e.target.value }))} rows={3} required />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setNoteOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={!noteForm.teacherId} className="bg-primary hover:bg-primary/90 text-primary-foreground">{t('common.save')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation (shared across all Action Center items) */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="w-[calc(100vw-32px)] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{lang === 'ar' ? 'تأكيد الحذف' : 'Confirm Delete'}</AlertDialogTitle>
            <AlertDialogDescription>
              {lang === 'ar'
                ? 'سيتم حذف هذا العنصر نهائياً ولا يمكن التراجع.'
                : 'This item will be permanently deleted. This cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="w-full sm:w-auto">{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 w-full sm:w-auto"
            >
              {lang === 'ar' ? 'حذف' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}