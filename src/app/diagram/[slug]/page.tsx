"use client";

import { use, useEffect, useState } from "react";
import FlowCanvas from "@/components/FlowCanvas";
import { getCachedDiagrams, fetchCloudDiagrams } from "@/lib/diagram-store";
import { DiagramMetadata } from "@/lib/types";

export default function DynamicDiagramPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  // Start undefined so server and client first render match (avoids hydration mismatch);
  // cached/cloud metadata is loaded after mount.
  const [meta, setMeta] = useState<DiagramMetadata | undefined>(undefined);
  const [readOnly, setReadOnly] = useState(false);

  // Read the view-only flag after mount (keeps SSR/client first render identical).
  useEffect(() => {
    setReadOnly(new URLSearchParams(window.location.search).get("view") === "1");
  }, []);

  useEffect(() => {
    const cached = getCachedDiagrams().find((d) => d.slug === slug);
    if (cached) setMeta(cached);
    let alive = true;
    fetchCloudDiagrams().then((list) => {
      if (!alive) return;
      const m = list.find((d) => d.slug === slug);
      if (m) setMeta(m);
    });
    return () => {
      alive = false;
    };
  }, [slug]);

  return (
    <FlowCanvas
      slug={slug}
      // Left undefined until the lookup resolves, deliberately. FlowCanvas shows a
      // placeholder for an undefined title but will not SAVE one, so a slow or failed
      // gallery fetch can no longer rename the diagram to "Process Flowchart".
      title={meta?.title}
      subtitle={meta?.description}
      exportFilename={slug}
      readOnly={readOnly}
    />
  );
}
