import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const todaysDate = new Date();

// Haversine formula: distance between two lat/lng points in km
export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of Earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // distance in KM
}

// String Date to short date format (18-Oct)
export const formatUtcToTodayOrDayMonth = (isoDateString: string) => {
  if (!isoDateString) {
    return null;
  }

  try {
    const inputDate = new Date(isoDateString);

    // Check if the input date is today by comparing UTC year, month, and day.
    const isToday =
      inputDate.getFullYear() === todaysDate.getFullYear() &&
      inputDate.getMonth() === todaysDate.getMonth() &&
      inputDate.getDate() === todaysDate.getDate();

    if (isToday) {
      return "Today";
    }

    return inputDate.toDateString();

  } catch (error) {
    console.error("Error formatting date:", error);
    return null;
  }
};

export const formatTimeToAmPm = (timeString: string) => {
  if (!timeString) {
    return null;
  }

  try {
    // Split the time string to get hours and minutes
    const [hourString, minute] = timeString.split(':');
    let hours = parseInt(hourString, 10);

    // Determine AM or PM
    const ampm = hours >= 12 ? 'PM' : 'AM';
    
    // Convert to 12-hour format (12:00 PM for noon, 12:00 AM for midnight)
    hours = hours % 12;
    hours = hours ? hours : 12; // The hour '0' should be '12'
    
    // Return the formatted string
    return `${hours}:${minute} ${ampm}`;
  } catch (error) {
    console.error("Error formatting time:", error);
    return null;
  }
};