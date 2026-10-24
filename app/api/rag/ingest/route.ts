
import { NextRequest, NextResponse } from "next/server";
import { embedText, supabase } from "@/lib/rag";


const documents = [
  {
    title: "NASA FIRMS Overview",
    content:
      "NASA FIRMS stands for Fire Information for Resource Management System. It distributes satellite-derived active fire and thermal anomaly detections. A hotspot is a satellite observation, not definitive proof of a confirmed wildfire.",
  },
  {
    title: "Understanding Fire Detection Confidence",
    content:
      "Satellite fire products may include confidence values, acquisition times, brightness temperatures and satellite identifiers. Confidence categories depend on the dataset. Cloud cover, observation timing, spatial resolution and other conditions can affect detections. Always check the product metadata before interpreting confidence.",
  },
  {
    title: "Interpreting Fire Hotspots",
    content:
      "Multiple nearby hotspot detections can indicate an area that needs investigation, but they do not independently confirm a wildfire or establish its cause. Compare acquisition timestamps, locations, satellite sources and other authoritative information before drawing conclusions.",
  },
  {
    title: "Satellite Orbit Position Estimates",
    content:
      "Satellite positions can be estimated from orbital elements such as TLE or GP data using an orbital propagation model. These are calculated estimates, not live onboard telemetry. Their accuracy depends on the element epoch, data quality and time elapsed since the elements were published.",
  },
];

export async function POST(request: NextRequest) {
  const secret = process.env.INGEST_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: "INGEST_SECRET is not configured." },
      { status: 500 }
    );
  }

  if (
    request.headers.get("x-ingest-secret") !== secret
  ) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 }
    );
  }

  try {
    // Remove only this route's own seed documents before refreshing them.
    const { error: deleteError } = await supabase
      .from("terra_documents")
      .delete()
      .eq("source", "terrascope-seed");

    if (deleteError) throw deleteError;

    const rows = [];

    for (const doc of documents) {
      const embedding = await embedText(
        `${doc.title}\n${doc.content}`
      );

      rows.push({
        title: doc.title,
        content: doc.content,
        source: "terrascope-seed",
        embedding,
      });
    }

    const { error: insertError } = await supabase
      .from("terra_documents")
      .insert(rows);

    if (insertError) throw insertError;

    return NextResponse.json({
      success: true,
      inserted: rows.length,
      message: "TerraScope reference documents indexed.",
    });
  } catch (error) {
    console.error("RAG ingestion failed:", error);

    return NextResponse.json(
      { error: "Ingestion failed. Check the server terminal." },
      { status: 500 }
    );
  }
}
