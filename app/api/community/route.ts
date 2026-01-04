import { query } from "@/lib/db";
import { NextResponse } from "next/server";

const PAGE_SIZE = 3;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || PAGE_SIZE.toString(), 10);

    const offset = (page - 1) * limit;

    // ✅ Get paginated data
    const sql = `
      SELECT c.*
      FROM community_updates c
      ORDER BY c.created_at DESC
      LIMIT $1 OFFSET $2;
    `;
    const result = await query(sql, [limit, offset]);
    const updates = result.rows;

    // ✅ Get total count
    const totalCountQuery = await query(`SELECT COUNT(*) FROM community_updates;`);
    const totalCount = parseInt(totalCountQuery.rows[0].count, 10);

    // ✅ Calculate total pages
    const totalPages = Math.ceil(totalCount / limit);

    return NextResponse.json({
      success: true,
      page,
      limit,
      totalCount,
      totalPages,
      updates,
    });
  } catch (error: any) {
    console.error("Community Updates Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
