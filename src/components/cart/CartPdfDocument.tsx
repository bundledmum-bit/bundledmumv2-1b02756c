import {
  Document, Page, Text, View, Image, Link, StyleSheet,
} from "@react-pdf/renderer";

export type CartPdfItem = {
  name: string;
  brand?: string | null;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  imageUrl?: string | null;
  productUrl?: string | null;
  size?: string | null;
  color?: string | null;
};

type Props = {
  items: CartPdfItem[];
  subtotal: number;
  whatsappNumber?: string;
  generatedAt: Date;
};

// Brand palette mirrored from index.css HSL tokens:
//   forest        #2D6A4F  (153 43% 30%)
//   deep forest   #1C4F3A
//   coral         #F4845F  (16 88% 66%)
//   off-white     #FAF6F1
//   dark          #1A1A1A
//   text-med      #5A5A5A
//   text-light    #7A7A7A
//   border        #E8E0D8
//   mint          #D8EFE5
const styles = StyleSheet.create({
  page: { padding: 0, backgroundColor: "#FAF6F1", fontSize: 10, fontFamily: "Helvetica" },

  header: {
    backgroundColor: "#2D6A4F",
    paddingVertical: 28,
    paddingHorizontal: 32,
    textAlign: "center",
  },
  headerTitle: { color: "#F4845F", fontSize: 22, fontWeight: 800, marginBottom: 4 },
  headerTagline: { color: "#D8EFE5", fontSize: 10 },

  body: { padding: 32 },
  introTitle: { fontSize: 18, fontWeight: 700, color: "#1A1A1A", marginBottom: 4 },
  introMeta: { fontSize: 9, color: "#7A7A7A", marginBottom: 20 },

  itemsLabel: {
    fontSize: 9, fontWeight: 700, color: "#2D6A4F",
    backgroundColor: "#D8EFE5",
    paddingVertical: 6, paddingHorizontal: 12,
    borderTopLeftRadius: 8, borderTopRightRadius: 8,
    textTransform: "uppercase", letterSpacing: 0.5,
  },

  itemRow: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1, borderBottomColor: "#E8E0D8",
    padding: 12,
    alignItems: "center",
    gap: 12,
  },
  itemImg: { width: 56, height: 56, borderRadius: 6, objectFit: "cover", backgroundColor: "#FAF6F1" },
  itemImgPlaceholder: { width: 56, height: 56, borderRadius: 6, backgroundColor: "#E8E0D8" },
  itemMain: { flex: 1, flexDirection: "column", gap: 2 },
  itemName: { fontSize: 11, fontWeight: 700, color: "#1A1A1A" },
  itemMeta: { fontSize: 9, color: "#7A7A7A" },
  itemLink: { fontSize: 9, color: "#F4845F", textDecoration: "underline", marginTop: 4 },
  itemQty: { width: 40, textAlign: "center", fontSize: 10, color: "#1A1A1A" },
  itemPrice: { width: 80, textAlign: "right", fontSize: 10, color: "#7A7A7A" },
  itemTotal: { width: 80, textAlign: "right", fontSize: 11, fontWeight: 700, color: "#1A1A1A" },

  emptyRow: {
    backgroundColor: "#FFFFFF",
    borderBottomLeftRadius: 8, borderBottomRightRadius: 8,
    padding: 24, textAlign: "center",
  },
  emptyText: { fontSize: 11, color: "#7A7A7A" },

  totals: { marginTop: 16, backgroundColor: "#FAF6F1", borderRadius: 8, padding: 16 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  totalLabel: { fontSize: 11, color: "#5A5A5A" },
  totalValueGrand: { fontSize: 16, color: "#2D6A4F", fontWeight: 800 },

  whatsappBox: {
    marginTop: 20, padding: 14, backgroundColor: "#D8EFE5", borderRadius: 8,
    textAlign: "center",
  },
  whatsappTitle: { fontSize: 11, fontWeight: 700, color: "#2D6A4F", marginBottom: 4 },
  whatsappText: { fontSize: 9, color: "#5A5A5A" },

  footer: {
    backgroundColor: "#1A1A1A",
    paddingVertical: 16, paddingHorizontal: 32,
    textAlign: "center",
  },
  footerLogo: { fontSize: 14, color: "#F4845F", fontWeight: 800, marginBottom: 4 },
  footerText: { fontSize: 8, color: "#7A7A7A" },
});

const fmt = (n: number) => "₦" + (Math.round(n || 0)).toLocaleString("en-NG");

export function CartPdfDocument({ items, subtotal, whatsappNumber, generatedAt }: Props) {
  const dateStr = generatedAt.toLocaleDateString("en-NG", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const isEmpty = !items || items.length === 0;

  return (
    <Document title="BundledMum Cart" author="BundledMum">
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>BundledMum</Text>
          <Text style={styles.headerTagline}>Maternity & Baby Essentials</Text>
        </View>

        {/* Body */}
        <View style={styles.body}>
          <Text style={styles.introTitle}>Your Cart</Text>
          <Text style={styles.introMeta}>Generated {dateStr}</Text>

          <Text style={styles.itemsLabel}>Items ({items.length})</Text>

          {isEmpty ? (
            <View style={styles.emptyRow}>
              <Text style={styles.emptyText}>(empty)</Text>
            </View>
          ) : (
            items.map((item, idx) => {
              const isLast = idx === items.length - 1;
              const hasUsableImage = !!item.imageUrl && /^https?:\/\//i.test(item.imageUrl);
              return (
                <View
                  key={idx}
                  style={[
                    styles.itemRow,
                    isLast ? { borderBottomLeftRadius: 8, borderBottomRightRadius: 8 } : {},
                  ]}
                >
                  {hasUsableImage
                    ? <Image src={item.imageUrl!} style={styles.itemImg} />
                    : <View style={styles.itemImgPlaceholder} />}
                  <View style={styles.itemMain}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    {item.brand && <Text style={styles.itemMeta}>Brand: {item.brand}</Text>}
                    {(item.size || item.color) && (
                      <Text style={styles.itemMeta}>
                        {[item.size && `Size: ${item.size}`, item.color && `Colour: ${item.color}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    )}
                    {item.productUrl && (
                      <Link src={item.productUrl} style={styles.itemLink}>View Product</Link>
                    )}
                  </View>
                  <Text style={styles.itemQty}>×{item.qty}</Text>
                  <Text style={styles.itemPrice}>{fmt(item.unitPrice)}</Text>
                  <Text style={styles.itemTotal}>{fmt(item.lineTotal)}</Text>
                </View>
              );
            })
          )}

          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValueGrand}>{fmt(subtotal)}</Text>
            </View>
          </View>

          {whatsappNumber && (
            <View style={styles.whatsappBox}>
              <Text style={styles.whatsappTitle}>Have questions about this cart?</Text>
              <Text style={styles.whatsappText}>Chat with us on WhatsApp: {whatsappNumber}</Text>
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerLogo}>BundledMum</Text>
          <Text style={styles.footerText}>Trusted maternity & baby essentials for Nigerian mums</Text>
          <Text style={styles.footerText}>bundledmum.com</Text>
        </View>
      </Page>
    </Document>
  );
}

export default CartPdfDocument;
