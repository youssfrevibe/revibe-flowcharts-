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
      title={meta?.title || "Process Flowchart"}
      subtitle={meta?.description || "Interactive process editor"}
      exportFilename={slug}
    />
  );
}
