// Fetch offers | requests
interface FetchRides {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  rides: any[];
}

// Safety Reminder Dashboard
interface Reminder {
  id: string;
  title: string;
  message: string;
  icon: string;
  color: string;
  bgColor: string;
  priority: "high" | "medium";
}

// Ride Data combining Offers and Requests
interface CombineRideData {
  id: string;
  driver_id?: string;
  passenger_id?: string;
  pickup_location: string;
  drop_location: string;
  full_name: string;
  time: string;
  price_per_seat: number;
  avg_rating?: number;
  available_seats?: number;
  seats_required?: number;
  age?: number;
  college?: string;
  created_at: string;
  date: string;
  drop_lat: number;
  drop_lng: number;
  email: string;
  is_verified: boolean;
  notes: string;
  phone: string;
  pickup_lat: number;
  pickup_lng: number;
  profile_image: string;
  role: string;
  status: string;
  updated_at: string;
  vehicle_details?: string;
}

// quickActionCards
interface Action {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  textColor: string;
  route: string;
  stats: string;
}

// Ride Offer
interface RideOfferData {
  age?: number;
  available_seats: number;
  avg_rating?: number;
  college?: string;
  created_at: string;
  date: string;
  driver_id: string;
  drop_lat: number;
  drop_lng: number;
  drop_location: string;
  email: string;
  full_name: string;
  id: string;
  is_verified: boolean;
  notes: string;
  phone: string;
  pickup_lat: number;
  pickup_lng: number;
  pickup_location: string;
  price_per_seat: number;
  profile_image: string;
  role: string;
  status: string;
  time: string;
  updated_at: string;
  vehicle_details: string;
}

// Ride Request
interface RideRequestData {
  age?: number;
  seats_required: number;
  avg_rating?: number;
  college?: string;
  created_at: string;
  date: string;
  passenger_id: string;
  drop_lat: number;
  drop_lng: number;
  drop_location: string;
  email: string;
  full_name: string;
  id: string;
  is_verified: boolean;
  notes: string;
  phone: string;
  pickup_lat: number;
  pickup_lng: number;
  pickup_location: string;
  price_per_seat: number;
  profile_image: string;
  role: string;
  status: string;
  time: string;
  updated_at: string;
}

type RideType = "offer" | "request";

// Community Updates
interface CommunityUpdates {
  id: string;
  type: string;
  title: string;
  content: string;
  author: string;
  created_at: string;
  image_url: string;
}

// fetch bookings data
interface BookingsData {
  booking_id: string;
  created_at: string;
  date: string;
  driver_id: string;
  drop_location: string;
  other_user_email: string;
  other_user_name: string;
  passenger_id: string;
  pickup_location: string;
  price_per_seat: string;
  ride_id: string;
  role: string;
  seats_booked: number;
  status: string;
  time: string;
  total_price: string;
  updated_at: string;
  user_role: string;
}

// - Mapping props
interface MapProps {
  className?: string;
  rideId?: string;
  showRoute?: boolean;
  pickupLocation?: [number, number];
  destinationLocation?: [number, number];
  showLiveTracking?: boolean;
}

// - Create Ride Dialog props
interface CreateRideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type RideFormState = CreateRideData & {
  date?: Date;
  time: string;
};

// - Request Ride Dialog props
interface RequestRideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// - Search and Action props
interface SearchAndActionProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

// - Navitems props
type SpringCfg = { mass?: number; stiffness?: number; damping?: number };

type DockItemSpec = {
  href: string;
  label: string;
  icon: React.ReactNode;
  className?: string;
};

type DockProps = {
  items: DockItemSpec[];
  className?: string;
  spring?: SpringCfg;
  magnification?: number;
  distance?: number;
  panelHeight?: number;
  dockHeight?: number;
  baseItemSize?: number;
  position?: "top" | "bottom";
};

// - Ratings (from users) Section props
interface RatingsSectionProps {
  userId: string; // profile being viewed (rated user)
  rideId?: string; // optional: if rating is linked to a specific ride
}

// - Ride Booking type (used in ride bookings list and ride details)
interface RideBooking {
  id: string;
  ride_offer_id?: string;
  ride_request_id?: string;
  rider_id: string;
  seats_booked: number;
  total_price: number;
  booking_status: string;
  can_review: boolean;
  pickup_address?: string;
  created_at: string;
  updated_at: string;
  ride_offer?: {
    id: string;
    driver_id: string;
    origin_address: string;
    destination_address: string;
    departure_time: string;
    price_per_seat: number;
    ride_offer_description?: string;
    ride_offer_status: string;
    driver?: {
      id: string;
      full_name: string;
      avatar_url?: string;
      college: string;
      avg_rating?: number;
    };
  };
  ride_request?: {
    id: string;
    passenger_id: string;
    origin_address: string;
    destination_address: string;
    departure_time: string;
    seats_needed: number;
    price_offer: number;
    ride_request_description?: string;
    ride_request_status: string;
    passenger?: {
      id: string;
      full_name: string;
      avatar_url?: string;
      college: string;
      avg_rating?: number;
    };
  };
  rider?: {
    id: string;
    full_name: string;
    avatar_url?: string;
    college: string;
    avg_rating?: number;
  };
}

// - Ride type (used in ride listings and ride details)
interface RideOffer {
  id: string;
  driver_id: string;
  vehicle_id?: string;
  origin_lat?: number;
  origin_lng?: number;
  origin_address?: string;
  destination_lat?: number;
  destination_lng?: number;
  destination_address?: string;
  departure_time: string;
  available_seats: number;
  price_per_seat: number;
  total_distance_km?: number;
  estimated_duration_minutes?: number;
  ride_offer_description?: string;
  ride_offer_status: "scheduled" | "active" | "completed" | "cancelled";
  created_at: string;
  updated_at: string;
  driver?: {
    id: string;
    full_name: string;
    avatar_url?: string;
    college: string;
    avg_rating?: number;
    is_verified?: boolean;
  };
  isAvailable?: boolean;
}

interface CreateRideData {
  origin_address: string;
  destination_address: string;
  departure_time: string;
  available_seats: number;
  price_per_seat: number;
  ride_offer_description?: string;
}

// - Create Ride Request form data
interface RideForRequests {
  id: string;
  driver_id: string;
  from_location: string;
  to_location: string;
  departure_time: string;
  available_seats: number;
  price_per_seat: number;
  description?: string;
  status: string;
  driver?: {
    id: string;
    full_name: string;
    avatar_url?: string;
    college: string;
    phone: string;
    avg_rating?: number;
  };
}

interface RideRequest {
  id: string;
  passenger_id: string;
  origin_lat?: number;
  origin_lng?: number;
  origin_address?: string;
  destination_lat?: number;
  destination_lng?: number;
  destination_address?: string;
  departure_time: string;
  seats_needed: number;
  price_offer: number;
  total_distance_km?: number;
  estimated_duration_minutes?: number;
  ride_request_description?: string;
  ride_request_status: string;
  created_at: string;
  updated_at: string;
  passenger?: {
    id: string;
    full_name: string;
    avatar_url?: string;
    college: string;
    avg_rating?: number;
  };
  seatsAvailable?: boolean;
}

interface CreateRideRequestData {
  origin_address: string;
  destination_address: string;
  departure_time: string;
  seats_needed: number;
  price_offer: number;
  ride_request_description?: string;
}

// - Dashboard stats type
interface DashboardStats {
  totalUsers: number;
  totalBookedRides: number;
  dailyRides: number;
  totalActiveRides: number;
  totalRideRequests: number;
  totalRideOffers: number;
  totalRevenue: number;
}

// - Wallet types
interface WalletTransaction {
  id: string;
  user_id: string; // profiles.id
  booking_id?: string;
  amount: number;
  transaction_type: "credit" | "debit";
  description: string;
  status: "pending" | "completed" | "failed";
  created_at: string;
}

interface UserWallet {
  id: string;
  user_id: string; // profiles.id
  balance: number;
  updated_at: string;
}

// Type for Profile based on profile page
// interface Profile {
//     id: string;
//     full_name: string;
//     email?: string;
//     college?: string;
//     phone?: string;
//     bio?: string;
//     created_at: string;
//     is_verified?: boolean;
//     avg_rating?: number;
//     avatar_url?: string;
//   }

// - User profile types
interface UserProfile {
  id: string; // primary key in Supabase
  clerk_id: string; // Clerk user ID
  full_name: string;
  college: string;
  phone?: string;
  avg_rating?: number;
  avatar_url?: string;
  bio?: string;
  verification_status?: "pending" | "verified" | "rejected";
  created_at: string;
  updated_at: string;
}

interface ProfileUpdateData {
  full_name?: string;
  college?: string;
  phone?: string;
  bio?: string;
}

// - Ratings types
interface Rating {
  id: string;
  rater_id: string;
  rated_id: string;
  ride_id: string;
  rating: number;
  comment?: string;
  created_at: string;
}

interface RatingWithProfile extends Rating {
  rater_profile?: {
    full_name: string;
    avatar_url?: string;
  };
}

// - Book Offer Dialog props
interface BookOfferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ride: Ride;
  onBook: (rideId: string, seats: number) => Promise<void>;
}
