/**
 * RideIT icon system — the one place icons are named and sourced from, so
 * no screen reaches for a raw emoji, Unicode glyph, or an ad hoc
 * lucide-react import under a mismatched name. Lucide covers generic UI
 * concepts (home, wallet, shield…); vehicles and map pins are custom SVG
 * because no icon library draws an auto-rickshaw.
 */
export {
  Home as HomeIcon,
  Briefcase as OfficeIcon,
  Users as FriendsIcon,
  Wallet as WalletIcon,
  Route as RideIcon,
  Contact2 as DriverIcon,
  UserRound as PassengerIcon,
  CreditCard as PaymentIcon,
  ShieldCheck as SafetyIcon,
  Navigation as NavigationIcon,
  MapPin as LocationIcon,
} from "lucide-react";

export * from "./vehicle-icons";
export * from "./map-markers";
