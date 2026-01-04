import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";
import { query } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    const { vehicle_number } = await req.json();

    if (!vehicle_number)
      return NextResponse.json(
        { error: "Vehicle number required" },
        { status: 400 }
      );

    const url = `https://rto-vehicle-details-rc-puc-insurance-mparivahan.p.rapidapi.com/api/rc-vehicle/search-data?vehicle_no=${encodeURIComponent(
      vehicle_number
    )}`;

    const options = {
      method: "GET",
      headers: {
        "x-rapidapi-key": process.env.RAPIDAPI_KEY!,
        "x-rapidapi-host":
          "rto-vehicle-details-rc-puc-insurance-mparivahan.p.rapidapi.com",
      },
    };

    const response = await fetch(url, options);
    const apiResponse = await response.json();

    // Log for debugging
    console.log("RapidAPI response:", apiResponse);

    const data = apiResponse?.data;
    if (!data || !data.rc_regn_no) {
      return NextResponse.json(
        { error: "Invalid vehicle data from API", details: apiResponse },
        { status: 500 }
      );
    }

    // Extract essential fields
    const vehicle = {
      user_id: userId,
      vehicle_number: data.rc_regn_no,
      manufacturer: data.rc_maker_desc || null,
      model: data.rc_maker_model || null,
      vehicle_type: data.rc_vh_class_desc || null,
      manufacture_year: data.rc_manu_month_yr || null,
      fuel_type: data.rc_fuel_desc || null,
      seat_capacity: parseInt(data.rc_seat_cap || "0"),
      insurance_valid_upto: data.rc_insurance_upto
        ? new Date(data.rc_insurance_upto).toISOString()
        : null,
      fitness_valid_upto: data.rc_fit_upto
        ? new Date(data.rc_fit_upto).toISOString()
        : null,
      registered_at: data.rc_registered_at || null,
    };

    const insertQuery = `
      INSERT INTO user_vehicles 
      (user_id, vehicle_number, manufacturer, model, vehicle_type, manufacture_year, fuel_type, seat_capacity, insurance_valid_upto, fitness_valid_upto, registered_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *;
    `;
    const values = [
      vehicle.user_id,
      vehicle.vehicle_number,
      vehicle.manufacturer,
      vehicle.model,
      vehicle.vehicle_type,
      vehicle.manufacture_year,
      vehicle.fuel_type,
      vehicle.seat_capacity,
      vehicle.insurance_valid_upto,
      vehicle.fitness_valid_upto,
      vehicle.registered_at,
    ];

    const result = await query(insertQuery, values);
    return NextResponse.json(
      { success: true, vehicle: result.rows[0] },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("Vehicle add error:", err);
    return NextResponse.json(
      { error: "Internal Server Error", err },
      { status: 500 }
    );
  }
}
