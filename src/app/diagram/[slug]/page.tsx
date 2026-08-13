"use client";

import { use } from "react";
import FlowCanvas from "@/components/FlowCanvas";
import { loadFlowchartData, getAllDiagrams } from "@/lib/diagram-store";

export default function DynamicDiagramPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const diagrams = getAllDiagrams();
  const meta = diagrams.find((d) => d.slug === slug);

  const title = meta ? meta.title : "Custom Process Flowchart";
  const subtitle = meta ? meta.description : "Interactive process editor";
  const initialData = loadFlowchartData(slug);

  return (
    <FlowCanvas
      title={title}
      subtitle={subtitle}
      initialNodes={initialData.nodes}
      initialConnections={initialData.connections}
      storageKey={slug}
      exportFilename={`${slug}.json`}
    />
  );
}
