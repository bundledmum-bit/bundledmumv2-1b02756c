import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { VendorMetrics } from "@/hooks/useVendorMetrics";

export type VendorFilter = "active" | "inactive" | "no_brands";

interface Props {
  metrics: VendorMetrics | undefined;
  isLoading: boolean;
  isError: boolean;
  onFilterChange: (filter: VendorFilter) => void;
}

function pct(value: number, denom: number): number {
  if (!denom) return 0;
  return Math.round((value / denom) * 100);
}

function MetricCard({
  label,
  value,
  denominator,
  subtitle,
  onClick,
}: {
  label: string;
  value: string | number;
  denominator?: number;
  subtitle?: string;
  onClick: () => void;
}) {
  const numericValue = typeof value === "number" ? value : null;
  const ratio = denominator != null && numericValue != null ? `${numericValue} / ${denominator}` : null;
  const percentage = denominator != null && numericValue != null ? `(${pct(numericValue, denominator)}%)` : null;

  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={onClick}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        {ratio ? (
          <>
            <div className="text-2xl font-bold">{ratio}</div>
            <div className="text-xs text-muted-foreground mt-1">{percentage}</div>
          </>
        ) : (
          <div className="text-2xl font-bold">{value}</div>
        )}
        {subtitle && <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>}
      </CardContent>
    </Card>
  );
}

export default function VendorMetricsStrip({ metrics, isLoading, isError, onFilterChange }: Props) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-7 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Error / no-data: show 5 placeholder cards with em-dashes; toast handled
  // by the parent so we don't re-fire on every render.
  if (isError || !metrics) {
    const dashes = ["Active Vendors", "Inactive Vendors", "Vendors With No Brands", "Products With Vendor", "Brand Variants With Vendor"];
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {dashes.map(label => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">—</div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      <MetricCard
        label="Active Vendors"
        value={metrics.activeVendors}
        onClick={() => onFilterChange("active")}
      />
      <MetricCard
        label="Inactive Vendors"
        value={metrics.inactiveVendors}
        onClick={() => onFilterChange("inactive")}
      />
      <MetricCard
        label="Vendors With No Brands"
        value={metrics.vendorsNoBrands}
        subtitle={metrics.activeVendorsNoBrands > 0 ? `(${metrics.activeVendorsNoBrands} are active)` : undefined}
        onClick={() => onFilterChange("no_brands")}
      />
      <MetricCard
        label="Products With Vendor"
        value={metrics.productsWithVendor}
        denominator={metrics.totalActiveProducts}
        onClick={() => navigate("/admin/products?filter=vendor_linked")}
      />
      <MetricCard
        label="Brand Variants With Vendor"
        value={metrics.brandsWithVendor}
        denominator={metrics.totalBrands}
        onClick={() => navigate("/admin/products?filter=brands_vendor_linked")}
      />
    </div>
  );
}
