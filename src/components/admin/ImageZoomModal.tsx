// Back-compat re-export. The component now lives at
// src/components/ImageZoomModal.tsx so non-admin surfaces can import
// it without crossing the admin boundary. Existing admin imports keep
// working unchanged.
export { default } from "@/components/ImageZoomModal";
export * from "@/components/ImageZoomModal";
