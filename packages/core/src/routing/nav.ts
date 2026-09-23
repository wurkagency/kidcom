// Navigation primitives for themes. Themes import these from @kidcom/core,
// never from the router package directly, so the router stays swappable.
export { Link, NavLink, Navigate, useLocation, useNavigate, useParams, useSearchParams, useMatch } from "react-router";
export type { LinkProps, NavLinkProps } from "react-router";
