import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("test_connection")
      .select("*")
      .limit(1);

    if (error && error.code !== "PGRST205" && error.code !== "42P01") {
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: error
        ? "Supabase connected. Test table does not exist yet."
        : "Supabase database connected successfully.",
      data,
    });
  } catch (error) {
    console.error("Database test failed:", error);

    return NextResponse.json(
      { success: false, message: "Database connection failed." },
      { status: 500 }
    );
  }
}
