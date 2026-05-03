import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useUpsertVendor, type Vendor } from "@/hooks/useVendors";

const PAYMENT_TERMS = ["Net 7", "Net 14", "Net 30", "Cash on Delivery"];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vendor?: Vendor | null;
}

export default function VendorEditDialog({ open, onOpenChange, vendor }: Props) {
  const upsert = useUpsertVendor();
  const [form, setForm] = useState({
    name: "",
    contact_person: "",
    phone: "",
    whatsapp: "",
    email: "",
    payment_terms: "",
    location: "",
    notes: "",
    is_active: true,
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: vendor?.name || "",
        contact_person: vendor?.contact_person || "",
        phone: vendor?.phone || "",
        whatsapp: vendor?.whatsapp || "",
        email: vendor?.email || "",
        payment_terms: vendor?.payment_terms || "",
        location: vendor?.location || "",
        notes: vendor?.notes || "",
        is_active: vendor?.is_active ?? true,
      });
    }
  }, [open, vendor]);

  const upd = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (!form.name.trim()) {
      toast.error("Vendor name is required");
      return;
    }
    try {
      const payload: any = {
        ...form,
        contact_person: form.contact_person || null,
        phone: form.phone || null,
        whatsapp: form.whatsapp || null,
        email: form.email || null,
        payment_terms: form.payment_terms || null,
        location: form.location || null,
        notes: form.notes || null,
      };
      if (vendor?.id) payload.id = vendor.id;
      await upsert.mutateAsync(payload);
      toast.success(vendor?.id ? "Vendor updated" : "Vendor added");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save vendor");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{vendor?.id ? "Edit Vendor" : "Add Vendor"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs font-semibold text-muted-foreground">Name *</label>
            <Input value={form.name} onChange={upd("name")} placeholder="Vendor company name" />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Contact person</label>
            <Input value={form.contact_person} onChange={upd("contact_person")} />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Phone</label>
            <Input value={form.phone} onChange={upd("phone")} />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">WhatsApp</label>
            <Input value={form.whatsapp} onChange={upd("whatsapp")} />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Email</label>
            <Input type="email" value={form.email} onChange={upd("email")} />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Payment terms</label>
            <Select value={form.payment_terms} onValueChange={v => setForm(f => ({ ...f, payment_terms: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select terms" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_TERMS.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Location</label>
            <Input value={form.location} onChange={upd("location")} />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-semibold text-muted-foreground">Notes</label>
            <textarea
              className="w-full border border-border rounded-md p-2 text-sm bg-background"
              rows={3}
              value={form.notes}
              onChange={upd("notes")}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={upsert.isPending}>
            {upsert.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
