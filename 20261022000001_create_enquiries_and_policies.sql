-- ==============================================================================
-- Migration: 20261022000001_create_enquiries_and_policies.sql
-- Description: Creates customer enquiries table, indexes, RLS policies, and grants.
-- ==============================================================================

-- 1. Create Enquiries Table
CREATE TABLE IF NOT EXISTS public.enquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    flavour_interest TEXT,
    enquiry_type TEXT NOT NULL DEFAULT 'general'
        CHECK (
            enquiry_type IN (
                'general',
                'franchise',
                'bulk_order',
                'wholesale',
                'feedback'
            )
        ),
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new'
        CHECK (
            status IN (
                'new',
                'contacted',
                'resolved',
                'archived'
            )
        ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Indexes for Efficient Lookup
CREATE INDEX IF NOT EXISTS idx_enquiries_created_at
    ON public.enquiries (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_enquiries_status
    ON public.enquiries (status);

CREATE INDEX IF NOT EXISTS idx_enquiries_type
    ON public.enquiries (enquiry_type);

-- 3. Enable Row Level Security
ALTER TABLE public.enquiries ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies

-- Allow public visitors and authenticated users to submit enquiries.
DROP POLICY IF EXISTS "Allow public insert on enquiries"
    ON public.enquiries;

CREATE POLICY "Allow public insert on enquiries"
    ON public.enquiries
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- Allow active Super Admins to read enquiries.
DROP POLICY IF EXISTS "Allow authenticated admins to read enquiries"
    ON public.enquiries;

CREATE POLICY "Allow authenticated admins to read enquiries"
    ON public.enquiries
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE profiles.id = (SELECT auth.uid())
              AND profiles.role IN ('super_admin', 'super-admin')
              AND profiles.is_active = true
        )
    );

-- Allow active Super Admins to update enquiries.
-- The column-level grant below restricts updates to status only.
DROP POLICY IF EXISTS "Allow authenticated admins to update enquiries"
    ON public.enquiries;

CREATE POLICY "Allow authenticated admins to update enquiries"
    ON public.enquiries
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE profiles.id = (SELECT auth.uid())
              AND profiles.role IN ('super_admin', 'super-admin')
              AND profiles.is_active = true
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE profiles.id = (SELECT auth.uid())
              AND profiles.role IN ('super_admin', 'super-admin')
              AND profiles.is_active = true
        )
    );

-- 5. Database Grants

GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Public enquiry submission.
GRANT INSERT ON TABLE public.enquiries TO anon, authenticated;

-- Authenticated users need SELECT permission at the SQL privilege level.
-- RLS still determines which rows they can read.
GRANT SELECT ON TABLE public.enquiries TO authenticated;

-- Remove table-wide UPDATE permission, then permit status updates only.
REVOKE UPDATE ON TABLE public.enquiries FROM anon, authenticated;

GRANT UPDATE (status)
    ON TABLE public.enquiries
    TO authenticated;

-- ==============================================================================
-- END OF MIGRATION
-- ==============================================================================