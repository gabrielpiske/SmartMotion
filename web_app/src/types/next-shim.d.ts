declare module "next" {
  export interface NextConfig {
    [key: string]: any;
  }
  export interface Metadata {
    [key: string]: any;
  }
  export interface Viewport {
    [key: string]: any;
  }
  export type ResolvingMetadata = Promise<Metadata>;
  export type ResolvingViewport = Promise<Viewport>;
}

declare module "next/types.js" {
  export interface NextConfig {
    [key: string]: any;
  }
  export interface Metadata {
    [key: string]: any;
  }
  export interface Viewport {
    [key: string]: any;
  }
  export type ResolvingMetadata = Promise<Metadata>;
  export type ResolvingViewport = Promise<Viewport>;
}

declare module "next/font/google" {
  export function Inter(options?: any): { className: string };
}

declare module "next/link" {
  import { ComponentType, AnchorHTMLAttributes } from "react";
  const Link: ComponentType<AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; [key: string]: any }>;
  export default Link;
}
