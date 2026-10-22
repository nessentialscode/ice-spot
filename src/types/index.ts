export interface Flavour {
  id: string;
  index: number;
  name: string;
  tagline: string;
  description: string;
  category: string;
  color: string;
  glow: string;
  position: {
    left: string;
    top: string;
    width: string;
    height: string;
  };
  stickImg: string;
  showcaseImg: string;
  isPopular?: boolean;
  ingredients?: string[];
}

export type Region = 'all' | 'thrissur' | 'thrissur-town' | 'thrissur-coastal' | 'ernakulam' | 'palakkad' | 'malappuram' | 'other';
export type SubRegion = 'town' | 'coastal';
export type BranchStatus = 'factory' | 'confirmed' | 'candidate';

export interface Branch {
  id: string;
  name: string;
  location: string;
  district: string;
  region: Region;
  subRegion?: SubRegion;
  status: BranchStatus;
  isFactoryHeadquarters?: boolean;
  phone?: string;
  mapQuery?: string;
  highlights?: string[];
  timing?: string;
  isOpen?: boolean;
}

export interface Review {
  id: string;
  author: string;
  role: string;
  rating: number;
  text: string;
  source: string;
}

export interface ContactEnquiry {
  id?: string;
  name: string;
  phone: string;
  email?: string;
  flavourInterest?: string;
  enquiryType: 'general' | 'franchise' | 'bulk_order' | 'feedback';
  message: string;
  created_at?: string;
}

export interface AdminUser {
  id: string;
  email: string;
  role: 'admin' | 'staff';
}
