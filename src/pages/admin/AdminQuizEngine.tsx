import { useState, useCallback, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAllQuizConfig, type QuizQuestion, type QuizRoutingRule, type QuizAdjustmentRule, type QuizTargetCount } from "@/hooks/useQuizConfig";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Play, Save, Trash2, Plus, GripVertical, ChevronDown, ChevronRight, Download, AlertTriangle } from "lucide-react";
import ReactFlow, {
  Background, Controls, MiniMap, MarkerType,
  type Node, type Edge,
} from "reactflow";
import "reactflow/dist/style.css";
import QuizContentEditor from "@/components/admin/QuizContentEditor";

// ========= FLOWCHART TAB =========

function getPathColor(paths: string[] | null): string {
  if (!paths || paths.length === 0) return "#22c55e";
  const hasSelf = paths.includes("self");
  const hasGift = paths.includes("gift");
  const hasDad = paths.includes("dad");
  const count = [hasSelf, hasGift, hasDad].filter(Boolean).length;
  if (count >= 3 || paths.includes("both")) return "#22c55e";
  if (hasDad && !hasSelf && !hasGift) return "#f97316";
  if (hasGift && !hasSelf && !hasDad) return "#7c3aed";
  if (hasSelf && !hasGift && !hasDad) return "#3b82f6";
  if (hasSelf && hasDad) return "#3b82f6";
  if (hasSelf && hasGift) return "#6366f1";
  if (hasGift && hasDad) return "#a855f7";
  return "#22c55e";
}

function getLaneY(paths: string[] | null): number {
  if (!paths || paths.length === 0) return 250;
  const hasSelf = paths.includes("self");
  const hasGift = paths.includes("gift");
  const hasDad = paths.includes("dad");
  const count = [hasSelf, hasGift, hasDad].filter(Boolean).length;
  if (count >= 2 || paths.includes("both")) return 250;
  if (hasGift) return 500;
  if (hasDad) return 0;
  return 250;
}

function QuizFlowchart({ questions, routingRules }: { questions: QuizQuestion[]; routingRules: QuizRoutingRule[] }) {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const nodes: Node[] = useMemo(() => {
    const n: Node[] = [];
    n.push({
      id: "__start__",
      type: "default",
      position: { x: 0, y: 250 },
      data: { label: "🟢 Quiz Start" },
      style: { background: "#22c55e", color: "#fff", borderRadius: 12, fontWeight: 700, padding: "8px 16px", border: "none" },
    });

    let x = 280;
    questions.forEach((q) => {
      const color = getPathColor(q.applies_to_path);
      const y = getLaneY(q.applies_to_path);
      const pathBadges = (q.applies_to_path || []).join(", ");
      n.push({
        id: q.step_id,
        type: "default",
        position: { x, y },
        data: {
          label: (
            <div className="text-left">
              <div className="text-[10px] font-bold uppercase" style={{ color: `${color}99` }}>{q.step_id}</div>
              <div className="text-xs font-semibold">{q.question_text.slice(0, 40)}{q.question_text.length > 40 ? "…" : ""}</div>
              <div className="text-[9px] opacity-70 mt-0.5">
                {q.input_type} · {q.quiz_options.length} opts{q.is_skippable ? " · skip" : ""}
              </div>
              <div className="text-[8px] opacity-50 mt-0.5">{pathBadges}</div>
            </div>
          ),
        },
        style: {
          background: q.is_active === false ? "#374151" : color,
          color: "#fff",
          borderRadius: 10,
          padding: "6px 10px",
          border: q.is_active === false ? "2px dashed #666" : selectedNode === q.step_id ? "3px solid #fbbf24" : "none",
          minWidth: 180,
          maxWidth: 220,
          opacity: q.is_active === false ? 0.5 : 1,
        },
      });
      x += 280;
    });

    n.push({
      id: "__end__",
      type: "default",
      position: { x, y: 250 },
      data: { label: "🔴 Show Results" },
      style: { background: "#ef4444", color: "#fff", borderRadius: 12, fontWeight: 700, padding: "8px 16px", border: "none" },
    });

    return n;
  }, [questions, selectedNode]);

  const edges: Edge[] = useMemo(() => {
    const e: Edge[] = [];
    if (questions.length > 0) {
      e.push({
        id: "start-to-first",
        source: "__start__",
        target: questions[0].step_id,
        animated: true,
        style: { stroke: "#22c55e" },
        markerEnd: { type: MarkerType.ArrowClosed },
      });
    }

    routingRules.forEach((rule) => {
      const target = rule.next_step_id === "__end__" ? "__end__" : rule.next_step_id;
      const isAlways = rule.condition_operator === "always";
      const label = isAlways ? "" : `${rule.condition_answer || ""}`;
      const fromQ = questions.find(q => q.step_id === rule.from_step_id);
      const fromPaths = fromQ?.applies_to_path || [];
      const color = getPathColor(fromPaths);

      e.push({
        id: rule.id,
        source: rule.from_step_id,
        target,
        label: label ? label.slice(0, 20) : undefined,
        animated: isAlways,
        style: {
          stroke: color,
          strokeDasharray: isAlways ? undefined : "5 5",
          strokeWidth: 1.5,
        },
        markerEnd: { type: MarkerType.ArrowClosed },
        labelStyle: { fontSize: 9, fill: "#888" },
      });
    });

    return e;
  }, [routingRules, questions]);

  const selectedQuestion = selectedNode ? questions.find(q => q.step_id === selectedNode) : null;
  const selectedRules = selectedNode ? routingRules.filter(r => r.from_step_id === selectedNode) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Quiz Flowchart</h2>
      </div>
      <div className="flex gap-4">
        <div className={`border border-border rounded-xl overflow-hidden ${selectedNode ? "flex-1" : "w-full"}`} style={{ height: 600 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            onNodeClick={(_, node) => setSelectedNode(node.id === "__start__" || node.id === "__end__" ? null : node.id)}
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>

        {selectedQuestion && (
          <div className="w-80 border border-border rounded-xl p-4 bg-card overflow-y-auto" style={{ maxHeight: 600 }}>
            <div className="flex items-center justify-between mb-3">
              <Badge variant="outline" className="font-mono text-xs">{selectedQuestion.step_id}</Badge>
              <button onClick={() => setSelectedNode(null)} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
            </div>
            <h3 className="font-bold text-sm mb-1">{selectedQuestion.question_text}</h3>
            <p className="text-muted-foreground text-xs mb-3">{selectedQuestion.sub_text}</p>
            <div className="flex gap-1 mb-3 flex-wrap">
              {(selectedQuestion.applies_to_path || []).map(p => (
                <Badge key={p} variant="secondary" className="text-[10px]">{p}</Badge>
              ))}
              <Badge variant={selectedQuestion.is_active ? "default" : "secondary"} className="text-[10px]">
                {selectedQuestion.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>

            <h4 className="text-[11px] font-bold text-muted-foreground uppercase mb-2">Options ({selectedQuestion.quiz_options.length})</h4>
            <div className="space-y-1.5 mb-4">
              {selectedQuestion.quiz_options.sort((a, b) => (a.display_order || 0) - (b.display_order || 0)).map(opt => (
                <div key={opt.id} className="bg-muted/30 rounded-lg p-2 text-xs">
                  <div className="font-semibold">{opt.option_emoji} {opt.option_label}</div>
                  <div className="text-muted-foreground">{opt.option_value}</div>
                  {opt.option_description && <div className="text-muted-foreground italic">{opt.option_description}</div>}
                </div>
              ))}
            </div>

            <h4 className="text-[11px] font-bold text-muted-foreground uppercase mb-2">Routing Rules ({selectedRules.length})</h4>
            <div className="space-y-1.5">
              {selectedRules.map(rule => (
                <div key={rule.id} className="bg-muted/30 rounded-lg p-2 text-xs">
                  <div className="font-semibold">→ {rule.next_step_id}</div>
                  <div className="text-muted-foreground">
                    {rule.condition_operator === "always" ? "Always" : `${rule.condition_operator}: ${rule.condition_answer}`}
                    {rule.priority ? ` (p${rule.priority})` : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#3b82f6]" /> Self</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#7c3aed]" /> Gift</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#f97316]" /> Dad</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#22c55e]" /> All / Start</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#ef4444]" /> End</span>
      </div>
    </div>
  );
}

// ========= CONFIG EDITOR TAB =========

function QuestionsEditor({ questions, onRefresh }: { questions: QuizQuestion[]; onRefresh: () => void }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const toggleActive = async (q: QuizQuestion) => {
    await supabase.from("quiz_questions").update({ is_active: !q.is_active }).eq("id", q.id);
    toast.success(`${q.step_id} ${q.is_active ? "deactivated" : "activated"}`);
    onRefresh();
  };

  const saveQuestion = async (q: QuizQuestion) => {
    setSaving(q.id);
    const { error } = await supabase.from("quiz_questions").update({
      question_text: q.question_text,
      sub_text: q.sub_text,
      is_skippable: q.is_skippable,
      is_active: q.is_active,
      step_order: q.step_order,
    }).eq("id", q.id);
    if (error) toast.error("Failed to save");
    else toast.success("Question saved");
    setSaving(null);
    onRefresh();
  };

  const saveOption = async (opt: any) => {
    const { error } = await supabase.from("quiz_options").update({
      option_label: opt.option_label,
      option_emoji: opt.option_emoji,
      option_description: opt.option_description,
      price_modifier: opt.price_modifier,
      display_order: opt.display_order,
      is_active: opt.is_active,
    }).eq("id", opt.id);
    if (error) toast.error("Failed to save option");
    else toast.success("Option saved");
    onRefresh();
  };

  const addOption = async (questionId: string, stepId: string) => {
    await supabase.from("quiz_options").insert({
      question_id: questionId,
      option_value: `new-${Date.now()}`,
      option_label: "New Option",
      option_emoji: "📋",
      display_order: 99,
    });
    toast.success("Option added");
    onRefresh();
  };

  const deleteOption = async (optId: string) => {
    if (!confirm("Delete this option?")) return;
    await supabase.from("quiz_options").delete().eq("id", optId);
    toast.success("Option deleted");
    onRefresh();
  };

  return (
    <div className="space-y-2">
      <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground mb-3">Questions & Options</h3>
      {questions.sort((a, b) => a.step_order - b.step_order).map(q => (
        <div key={q.id} className={`border rounded-lg bg-card ${q.is_active === false ? "border-border/50 opacity-60" : "border-border"}`}>
          <button
            className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/30"
            onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
          >
            <GripVertical className="w-4 h-4 text-muted-foreground" />
            <Badge variant="outline" className="font-mono text-[10px]">{q.step_id}</Badge>
            <span className="text-sm font-semibold flex-1 truncate">{q.question_text}</span>
            <div className="flex gap-1">
              {(q.applies_to_path || []).map(p => (
                <Badge key={p} variant="secondary" className="text-[9px]">{p}</Badge>
              ))}
            </div>
            <Switch checked={q.is_active ?? true} onCheckedChange={() => toggleActive(q)} onClick={e => e.stopPropagation()} />
            {expandedId === q.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          {expandedId === q.id && (
            <div className="p-4 pt-0 border-t border-border space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">Question Text</label>
                  <Input defaultValue={q.question_text} className="text-sm" onBlur={e => { q.question_text = e.target.value; }} />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">Sub Text</label>
                  <Input defaultValue={q.sub_text || ""} className="text-sm" onBlur={e => { q.sub_text = e.target.value; }} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">Type</label>
                  <Badge variant="outline" className="text-[10px]">{q.input_type}</Badge>
                </div>
                <div>
                  <label className="flex items-center gap-2 text-xs">
                    <Switch checked={q.is_skippable ?? false} onCheckedChange={v => { q.is_skippable = v; }} />
                    Skippable
                  </label>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">Order</label>
                  <Input defaultValue={String(q.step_order)} type="number" className="w-20 text-sm" onBlur={e => { q.step_order = Number(e.target.value); }} />
                </div>
              </div>
              <Button size="sm" onClick={() => saveQuestion(q)} disabled={saving === q.id}>
                {saving === q.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />} Save Question
              </Button>

              <div className="mt-3">
                <h4 className="text-[11px] font-bold text-muted-foreground uppercase mb-2">Options ({q.quiz_options.length})</h4>
                <div className="space-y-1.5">
                  {q.quiz_options.sort((a, b) => (a.display_order || 0) - (b.display_order || 0)).map(opt => (
                    <div key={opt.id} className="flex items-center gap-2 bg-muted/30 rounded-lg p-2">
                      <Input defaultValue={opt.option_emoji || ""} className="w-12 text-center text-sm" onBlur={e => { opt.option_emoji = e.target.value; }} />
                      <Input defaultValue={opt.option_label} className="flex-1 text-sm" onBlur={e => { opt.option_label = e.target.value; }} />
                      <Input defaultValue={opt.option_description || ""} className="flex-1 text-sm" placeholder="Description" onBlur={e => { opt.option_description = e.target.value; }} />
                      <Badge variant="outline" className="font-mono text-[9px] shrink-0">{opt.option_value}</Badge>
                      <Input defaultValue={String(opt.price_modifier || 0)} className="w-20 text-sm" type="number" onBlur={e => { opt.price_modifier = Number(e.target.value) || null; }} />
                      <Switch checked={opt.is_active ?? true} onCheckedChange={v => { opt.is_active = v; saveOption(opt); }} />
                      <Button size="sm" variant="ghost" onClick={() => saveOption(opt)}>
                        <Save className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteOption(opt.id)}>
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => addOption(q.id, q.step_id)}>
                  <Plus className="w-3 h-3 mr-1" /> Add Option
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function RoutingRulesEditor({ rules, questions, onRefresh }: { rules: QuizRoutingRule[]; questions: QuizQuestion[]; onRefresh: () => void }) {
  const stepIds = questions.map(q => q.step_id);

  const saveRule = async (rule: QuizRoutingRule) => {
    const { error } = await supabase.from("quiz_routing_rules").update({
      from_step_id: rule.from_step_id,
      condition_answer: rule.condition_answer,
      condition_operator: rule.condition_operator,
      next_step_id: rule.next_step_id,
      priority: rule.priority,
      is_active: rule.is_active,
    }).eq("id", rule.id);
    if (error) toast.error("Failed to save rule");
    else toast.success("Rule saved");
    onRefresh();
  };

  const deleteRule = async (id: string) => {
    if (!confirm("Delete this routing rule?")) return;
    await supabase.from("quiz_routing_rules").delete().eq("id", id);
    toast.success("Rule deleted");
    onRefresh();
  };

  const addRule = async () => {
    await supabase.from("quiz_routing_rules").insert({
      from_step_id: stepIds[0] || "shopper",
      next_step_id: stepIds[1] || "budget",
      condition_operator: "always",
      priority: 0,
    });
    toast.success("Rule added");
    onRefresh();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Routing Rules ({rules.length})</h3>
        <Button size="sm" onClick={addRule}><Plus className="w-3 h-3 mr-1" /> Add Rule</Button>
      </div>
      <div className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>From Step</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead>Operator</TableHead>
              <TableHead>Next Step</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Active</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map(rule => (
              <TableRow key={rule.id}>
                <TableCell>
                  <select defaultValue={rule.from_step_id} className="border rounded px-2 py-1 text-xs bg-background" onChange={e => { rule.from_step_id = e.target.value; }}>
                    {stepIds.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </TableCell>
                <TableCell><Input defaultValue={rule.condition_answer || ""} className="w-28 text-xs" onBlur={e => { rule.condition_answer = e.target.value || null; }} /></TableCell>
                <TableCell>
                  <select defaultValue={rule.condition_operator || "always"} className="border rounded px-2 py-1 text-xs bg-background" onChange={e => { rule.condition_operator = e.target.value; }}>
                    {["always", "equals", "not_equals", "contains", "not_contains", "is_any", "is_none"].map(o => <option key={o}>{o}</option>)}
                  </select>
                </TableCell>
                <TableCell>
                  <select defaultValue={rule.next_step_id} className="border rounded px-2 py-1 text-xs bg-background" onChange={e => { rule.next_step_id = e.target.value; }}>
                    {[...stepIds, "__end__"].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </TableCell>
                <TableCell><Input defaultValue={String(rule.priority || 0)} type="number" className="w-16 text-xs" onBlur={e => { rule.priority = Number(e.target.value); }} /></TableCell>
                <TableCell><Switch checked={rule.is_active ?? true} onCheckedChange={v => { rule.is_active = v; saveRule(rule); }} /></TableCell>
                <TableCell className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => saveRule(rule)}><Save className="w-3 h-3" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteRule(rule.id)}><Trash2 className="w-3 h-3 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function AdjustmentRulesEditor({ rules, onRefresh }: { rules: QuizAdjustmentRule[]; onRefresh: () => void }) {
  const saveRule = async (rule: QuizAdjustmentRule) => {
    const { error } = await supabase.from("quiz_adjustment_rules").update({
      rule_name: rule.rule_name,
      trigger_step_id: rule.trigger_step_id,
      trigger_value: rule.trigger_value,
      trigger_operator: rule.trigger_operator,
      target_product_slug: rule.target_product_slug,
      action: rule.action,
      action_value: rule.action_value,
      priority: rule.priority,
      is_active: rule.is_active,
    }).eq("id", rule.id);
    if (error) toast.error("Failed to save");
    else toast.success("Saved");
    onRefresh();
  };

  const addRule = async () => {
    await supabase.from("quiz_adjustment_rules").insert({
      rule_name: "New Rule",
      trigger_step_id: "deliveryMethod",
      trigger_value: "csection",
      target_product_slug: "example-product",
      action: "force",
      priority: 0,
    });
    toast.success("Rule added");
    onRefresh();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Adjustment Rules ({rules.length})</h3>
        <Button size="sm" onClick={addRule}><Plus className="w-3 h-3 mr-1" /> Add Rule</Button>
      </div>
      <div className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rule Name</TableHead>
              <TableHead>Trigger Step</TableHead>
              <TableHead>Trigger Value</TableHead>
              <TableHead>Target Product</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Action Value</TableHead>
              <TableHead>Active</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map(rule => (
              <TableRow key={rule.id}>
                <TableCell><Input defaultValue={rule.rule_name} className="w-32 text-xs" onBlur={e => { rule.rule_name = e.target.value; }} /></TableCell>
                <TableCell><Input defaultValue={rule.trigger_step_id} className="w-28 text-xs" onBlur={e => { rule.trigger_step_id = e.target.value; }} /></TableCell>
                <TableCell><Input defaultValue={rule.trigger_value} className="w-24 text-xs" onBlur={e => { rule.trigger_value = e.target.value; }} /></TableCell>
                <TableCell><Input defaultValue={rule.target_product_slug} className="w-32 text-xs" onBlur={e => { rule.target_product_slug = e.target.value; }} /></TableCell>
                <TableCell><Input defaultValue={rule.action} className="w-24 text-xs" onBlur={e => { rule.action = e.target.value; }} /></TableCell>
                <TableCell><Input defaultValue={rule.action_value || ""} className="w-24 text-xs" onBlur={e => { rule.action_value = e.target.value; }} /></TableCell>
                <TableCell><Switch checked={rule.is_active ?? true} onCheckedChange={v => { rule.is_active = v; saveRule(rule); }} /></TableCell>
                <TableCell><Button size="sm" variant="ghost" onClick={() => saveRule(rule)}><Save className="w-3 h-3" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function TargetCountsEditor({ counts, onRefresh }: { counts: QuizTargetCount[]; onRefresh: () => void }) {
  const saveCount = async (c: QuizTargetCount) => {
    const { error } = await supabase.from("quiz_target_counts").update({
      target_count: c.target_count,
      min_count: c.min_count,
      max_count: c.max_count,
    }).eq("id", c.id);
    if (error) toast.error("Failed to save");
    else toast.success("Saved");
    onRefresh();
  };

  return (
    <div className="space-y-3">
      <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Target Counts per Budget Tier</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Budget Tier</TableHead>
            <TableHead>Target Count</TableHead>
            <TableHead>Min Count</TableHead>
            <TableHead>Max Count</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {counts.map(c => (
            <TableRow key={c.id}>
              <TableCell className="font-semibold capitalize">{c.budget_tier}</TableCell>
              <TableCell><Input defaultValue={String(c.target_count)} type="number" className="w-20 text-sm" onBlur={e => { c.target_count = Number(e.target.value); }} /></TableCell>
              <TableCell><Input defaultValue={String(c.min_count)} type="number" className="w-20 text-sm" onBlur={e => { c.min_count = Number(e.target.value); }} /></TableCell>
              <TableCell><Input defaultValue={String(c.max_count)} type="number" className="w-20 text-sm" onBlur={e => { c.max_count = Number(e.target.value); }} /></TableCell>
              <TableCell><Button size="sm" onClick={() => saveCount(c)}><Save className="w-3 h-3 mr-1" /> Save</Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// Category → scope / stage / is_gift mapping — byte-identical to HomeQuiz.
// Keeping this helper local so the tester stays self-contained.
function mapCategoriesToRpc(categories: Set<"maternity" | "baby" | "gift">): {
  scope: "hospital-bag" | "general-baby-prep" | "hospital-bag+general";
  stage: "expecting" | "newborn";
  isGift: boolean;
} {
  const isGift = categories.has("gift");
  let scope: "hospital-bag" | "general-baby-prep" | "hospital-bag+general";
  let stage: "expecting" | "newborn";
  if (isGift) { scope = "hospital-bag+general"; stage = "newborn"; }
  else if (categories.has("maternity") && categories.has("baby")) { scope = "hospital-bag+general"; stage = "expecting"; }
  else if (categories.has("maternity")) { scope = "hospital-bag"; stage = "expecting"; }
  else { scope = "general-baby-prep"; stage = "newborn"; }
  return { scope, stage, isGift };
}

const BUDGET_TIERS = [
  { value: "starter", label: "Starter", range: "₦80,000 – ₦199,999" },
  { value: "standard", label: "Standard", range: "₦200,000 – ₦749,999" },
  { value: "premium", label: "Premium", range: "₦750,000 and above" },
];

function EngineTestPanel() {
  const [categories, setCategories] = useState<Set<"maternity" | "baby" | "gift">>(new Set(["maternity", "baby"]));
  const [params, setParams] = useState({
    p_budget_tier: "standard",
    p_scope: "hospital-bag+general" as "hospital-bag" | "general-baby-prep" | "hospital-bag+general",
    p_stage: "expecting" as "expecting" | "newborn" | "0-3m" | "3-6m" | "6-12m",
    p_hospital_type: "public",
    p_delivery_method: "vaginal",
    p_multiples: 1,
    p_gender: "neutral",
    p_first_baby: false,
    p_is_gift: false,
  });
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const toggleCategory = (c: "maternity" | "baby" | "gift") => {
    const next = new Set(categories);
    if (c === "gift") {
      if (next.has("gift")) return;
      next.clear();
      next.add("gift");
    } else {
      if (next.has("gift")) next.delete("gift");
      if (next.has(c)) {
        if (next.size === 1) return;
        next.delete(c);
      } else {
        next.add(c);
      }
    }
    setCategories(next);
    // Auto-fill scope / stage / is_gift from the category choice
    const mapped = mapCategoriesToRpc(next);
    setParams(p => ({ ...p, p_scope: mapped.scope, p_stage: mapped.stage, p_is_gift: mapped.isGift }));
  };

  const runTest = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("run_quiz_recommendation", {
        p_budget_tier: params.p_budget_tier,
        p_scope: params.p_scope,
        p_stage: params.p_stage,
        p_hospital_type: params.p_hospital_type,
        p_delivery_method: params.p_delivery_method,
        p_multiples: params.p_multiples,
        p_gender: params.p_gender,
        p_first_baby: params.p_first_baby,
        p_is_gift: params.p_is_gift,
        p_gift_relationship: null,
      });
      if (error) throw error;
      setResult(data);
      toast.success("Engine test completed");
    } catch (err: any) {
      toast.error(err.message || "Engine error");
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground mb-1">Engine Tester</h3>
          <p className="text-xs text-muted-foreground">Simulates the home-quiz RPC call end-to-end. Category selection auto-fills scope, stage and is-gift just like on the storefront.</p>
        </div>

        {/* Category chip-picker — mirrors HomeQuiz */}
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">Categories selected</label>
          <div className="flex flex-wrap gap-2">
            {[
              { id: "maternity" as const, label: "Maternity List" },
              { id: "baby" as const, label: "Baby Things" },
              { id: "gift" as const, label: "Gifts for New Parents" },
            ].map(c => {
              const selected = categories.has(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggleCategory(c.id)}
                  className={`px-3 py-1.5 rounded-pill text-xs font-semibold border-2 transition-all ${selected ? "bg-coral/10 border-coral text-coral" : "border-border text-muted-foreground hover:border-coral/40"}`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            Auto-mapped → scope: <span className="font-mono">{params.p_scope}</span>, stage: <span className="font-mono">{params.p_stage}</span>, is_gift: <span className="font-mono">{String(params.p_is_gift)}</span>
          </p>
        </div>

        {/* Budget tier */}
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">Budget Tier</label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {BUDGET_TIERS.map(t => (
              <button
                key={t.value}
                onClick={() => setParams(p => ({ ...p, p_budget_tier: t.value }))}
                className={`text-left px-3 py-2 rounded-lg border-2 transition-all ${params.p_budget_tier === t.value ? "bg-coral/10 border-coral" : "border-border hover:border-coral/40"}`}
              >
                <div className="text-sm font-semibold">{t.label}</div>
                <div className="text-[10px] text-muted-foreground font-mono">{t.range}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Other fields — overridable advanced knobs */}
        <details className="border border-border rounded-lg p-3">
          <summary className="text-xs font-semibold cursor-pointer text-muted-foreground">Advanced overrides (scope, stage, hospital, delivery, gender, multiples, first baby, is-gift)</summary>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mt-3">
            {[
              { key: "p_scope", label: "Scope", options: ["hospital-bag", "hospital-bag+general", "general-baby-prep"] },
              { key: "p_stage", label: "Stage", options: ["expecting", "newborn", "0-3m", "3-6m", "6-12m"] },
              { key: "p_hospital_type", label: "Hospital Type", options: ["public", "private", "both"] },
              { key: "p_delivery_method", label: "Delivery Method", options: ["vaginal", "csection", "both"] },
              { key: "p_gender", label: "Gender", options: ["boy", "girl", "neutral", "unknown", "mixed"] },
            ].map(field => (
              <div key={field.key}>
                <label className="text-[11px] font-semibold text-muted-foreground">{field.label}</label>
                <select
                  value={(params as any)[field.key]}
                  onChange={e => setParams(p => ({ ...p, [field.key]: e.target.value }))}
                  className="w-full border rounded px-2 py-1.5 text-sm bg-background"
                >
                  {field.options.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            ))}
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">Multiples</label>
              <Input type="number" value={params.p_multiples} onChange={e => setParams(p => ({ ...p, p_multiples: Number(e.target.value) || 1 }))} />
            </div>
            <div>
              <label className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground mt-5">
                <Switch checked={params.p_first_baby} onCheckedChange={v => setParams(p => ({ ...p, p_first_baby: v }))} />
                First Baby
              </label>
            </div>
            <div>
              <label className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground mt-5">
                <Switch checked={params.p_is_gift} onCheckedChange={v => setParams(p => ({ ...p, p_is_gift: v }))} />
                Is Gift
              </label>
            </div>
          </div>
        </details>

        <Button onClick={runTest} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
          Run Test
        </Button>

        {result && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <div className="bg-muted rounded-lg p-3 text-center">
                <div className="text-xs text-muted-foreground">Products</div>
                <div className="text-xl font-bold">{result.product_count}</div>
              </div>
              <div className="bg-muted rounded-lg p-3 text-center">
                <div className="text-xs text-muted-foreground">Target</div>
                <div className="text-xl font-bold">{result.target_count}</div>
              </div>
              <div className="bg-muted rounded-lg p-3 text-center">
                <div className="text-xs text-muted-foreground">Engine</div>
                <div className="text-xs font-mono">{result.engine_version}</div>
              </div>
            </div>
            {result.products?.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                {result.products.map((p: any) => (
                  <div key={p.product_id} className="border rounded-lg p-2 text-xs">
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-muted-foreground">{p.brand?.brand_name} · ₦{p.brand?.price?.toLocaleString()}</div>
                    <div className="text-muted-foreground">{p.priority} · qty: {p.quantity}</div>
                  </div>
                ))}
              </div>
            )}
            <details>
              <summary className="text-xs text-muted-foreground cursor-pointer">Raw JSON</summary>
              <pre className="mt-2 bg-muted rounded-lg p-3 text-[10px] overflow-auto max-h-80">{JSON.stringify(result, null, 2)}</pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}

// ========= MAIN ADMIN QUIZ ENGINE =========

export default function AdminQuizEngine() {
  const { isSuperAdmin, can } = usePermissions();
  const { data: config, isLoading, refetch } = useAllQuizConfig();
  const qc = useQueryClient();

  const canManageQuiz = can("content", "manage_quiz");

  const onRefresh = useCallback(() => {
    refetch();
    qc.invalidateQueries({ queryKey: ["quiz_questions"] });
    qc.invalidateQueries({ queryKey: ["quiz_routing_rules"] });
  }, [refetch, qc]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase.channel("admin-quiz-config")
      .on("postgres_changes", { event: "*", schema: "public", table: "quiz_questions" }, () => onRefresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "quiz_routing_rules" }, () => onRefresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "quiz_adjustment_rules" }, () => onRefresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [onRefresh]);

  if (isLoading || !config) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { questions, routingRules, adjustmentRules, targetCounts } = config;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Quiz Engine</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Admin controls for the home-page quiz flow. Saves push live — no deploy needed.
        </p>
      </div>

      <Tabs defaultValue="content">
        <TabsList>
          <TabsTrigger value="content">Quiz Content</TabsTrigger>
          <TabsTrigger value="tuning">Product Tuning</TabsTrigger>
          {isSuperAdmin && <TabsTrigger value="tester">Engine Tester</TabsTrigger>}
          {isSuperAdmin && <TabsTrigger value="flowchart">Legacy Flowchart</TabsTrigger>}
        </TabsList>

        <TabsContent value="content">
          <QuizContentEditor />
        </TabsContent>

        <TabsContent value="tuning" className="space-y-8">
          <TargetCountsEditor counts={[...targetCounts]} onRefresh={onRefresh} />
          <AdjustmentRulesEditor rules={[...adjustmentRules]} onRefresh={onRefresh} />
        </TabsContent>

        {isSuperAdmin && (
          <TabsContent value="tester" className="space-y-8">
            <EngineTestPanel />
          </TabsContent>
        )}

        {isSuperAdmin && (
          <TabsContent value="flowchart" className="space-y-4">
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-bold text-amber-900">Legacy — not the active quiz flow</div>
                <p className="text-xs text-amber-800 mt-1">
                  This flowchart shows the old DB-driven multi-step quiz that is no longer surfaced to users. The home page now uses a single-screen widget defined entirely in the frontend. Kept here for reference; edits to these rules do not affect the live quiz.
                </p>
              </div>
            </div>
            <QuizFlowchart questions={questions} routingRules={routingRules} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
