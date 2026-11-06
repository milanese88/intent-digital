-- ============================================================================
-- Migration: county_data_tables.sql
-- Description: Create county parcels, sales, and sales qualification codes tables
-- Target: Neon PostgreSQL
-- Safe to execute repeatedly (Idempotent: CREATE IF NOT EXISTS / ON CONFLICT)
-- ============================================================================

-- 1. Real Property Parcels (Residential Focus: DOR Use Codes 000, 001, 002, 004, 008)
CREATE TABLE IF NOT EXISTS county_parcels (
    county text NOT NULL,
    parcel_id text NOT NULL,
    address text,
    city text,
    zip text,
    use_code text,
    living_sqft int,
    year_built int,
    eff_year_built int,
    land_sqft int,
    units int,
    just_value numeric,
    nbrhd_cd text,
    mkt_ar text,
    lat double precision NULL,
    lng double precision NULL,
    roll_year int,
    imported_at timestamptz DEFAULT now(),
    PRIMARY KEY (county, parcel_id)
);

-- 2. Property Sales History (SDF transactions + NAL prior sales history)
CREATE TABLE IF NOT EXISTS county_sales (
    id bigserial PRIMARY KEY,
    county text NOT NULL,
    parcel_id text NOT NULL,
    sale_price numeric,
    sale_year int,
    sale_month int,
    qual_code text,
    vi_cd text,
    multi_parcel text,
    or_book text DEFAULT '',
    or_page text DEFAULT '',
    clerk_no text,
    source text, -- 'SDF' or 'NAL'
    imported_at timestamptz DEFAULT now(),
    CONSTRAINT uq_county_sales UNIQUE (county, parcel_id, sale_year, sale_month, sale_price, or_book, or_page)
);

-- 3. DOR Sales Qualification Codes & Explanations
CREATE TABLE IF NOT EXISTS county_sale_codes (
    qual_code text PRIMARY KEY,
    label text NOT NULL,
    is_market boolean NOT NULL DEFAULT false,
    is_distressed boolean NOT NULL DEFAULT false
);

-- Idempotent column addition if table already exists in database
ALTER TABLE county_sale_codes 
    ADD COLUMN IF NOT EXISTS is_distressed boolean NOT NULL DEFAULT false;

-- ============================================================================
-- Indexes for Sub-15ms Valuation & Search Performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_county_parcels_zip 
    ON county_parcels (county, zip);

CREATE INDEX IF NOT EXISTS idx_county_parcels_use_code 
    ON county_parcels (county, use_code);

CREATE INDEX IF NOT EXISTS idx_county_parcels_addr_pattern 
    ON county_parcels (county, lower(address) text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_county_sales_parcel 
    ON county_sales (county, parcel_id);

CREATE INDEX IF NOT EXISTS idx_county_sales_comps 
    ON county_sales (county, sale_year, sale_month, qual_code);

-- ============================================================================
-- Reference Data: Florida Department of Revenue (FDOR) PTO Form DR-590 Codes
-- Exact descriptions extracted from 2026 NAL/SDF User's Guide (Rule 12D-1, F.A.C.)
-- is_market = true for '01' and '02' (arm's-length open market)
-- is_distressed = true for '12', '18', '19', '38' (foreclosures, REO, bank/court duress)
-- ============================================================================
INSERT INTO county_sale_codes (qual_code, label, is_market, is_distressed) VALUES
    ('01', 'Transfers qualified as arm’s length because of examination of the deed or other instrument transferring ownership of real property', true, false),
    ('02', 'Transfers qualified as arm’s length because of documented evidence', true, false),
    ('03', 'Arm’s length transaction at time of transfer, but the physical property characteristics changed significantly after the transfer AND prior to the January-1 assessment date, or transfer included property characteristics not substantially complete at the January 1 assessment date (use these subcodes: 1-parcel split, 2-parcel combination, 3-new construction, 4-deletion, 5-disaster, 6-other (including multiple changes), 7-remodel/renovation, 8-incomplete construction)', false, false),
    ('04', 'Arm’s length transaction at time of transfer, but the legal characteristics changed significantly after the transfer AND prior to the January 1 assessment date', false, false),
    ('05', 'Arm’s length transaction transferring multiple parcels with multiple parcel identification numbers (deed must be recorded on all parcels included in the transaction, and the full sale price, as calculated from the documentary stamp amount, must be reflected on all parcels)', false, false),
    ('06', 'Arm’s length transaction transferring a single parcel that crosses one or more county lines', false, false),
    ('11', 'Corrective Deed, Quit Claim Deed, or Tax Deed; deed bearing Florida documentary stamp at the minimum rate prescribed under chapter 201, F.S.; transfer of ownership in which no documentary stamps were paid', false, false),
    ('12', 'Transfer to or from financial institutions (use code 18 for government entities); deed stating “In Lieu of Foreclosure” (including private lenders)', false, true),
    ('13', 'Transfer conveying cemetery lots or parcels', false, false),
    ('14', 'Transfer containing a reservation of occupancy for more than 90 days (life estate interest)', false, false),
    ('15', 'Removed - not currently accepted; reserved for future use', false, false),
    ('16', 'Transfer conveying ownership of less than 100% undivided interest', false, false),
    ('17', 'Transfer to or from a religious, charitable, or benevolent organization or entity', false, false),
    ('18', 'Transfer to or from a federal, state, or local government agency (including trustees (or board) of the Internal Improvement Trust Fund, courts, counties, municipalities, sheriffs, or educational organizations as well as FDIC, HUD, FANNIE MAE, and FREDDY MAC)', false, true),
    ('19', 'Transfer to or from bankruptcy trustees, administrators, executors, guardians, personal representatives, or receivers', false, true),
    ('20', 'Transfer to or from utility companies', false, false),
    ('21', 'Contract for Deed; Agreement for Deed (does not include Warranty Deed associated with seller financing)', false, false),
    ('30', 'Transfer between relatives or between corporate affiliates (including landlord-tenant)', false, false),
    ('31', 'Transfer involving a trade or exchange of land (does not include 1031 exchanges)', false, false),
    ('32', 'Transfer involving an abnormal period of time between contract date and sale date (examples: pre-construction sales, pre-development sales)', false, false),
    ('33', 'Transfer that included incomplete or unbuilt common property', false, false),
    ('34', 'Transfer satisfying payment in full of a prior property contract', false, false),
    ('35', 'Transfer involving atypical amounts of personal property', false, false),
    ('36', 'Transfer involving atypical costs of sale', false, false),
    ('37', 'Transfer in which property’s market exposure was atypical; transfer involving participants who were atypically motivated; transfer involving participants who were not knowledgeable or informed of market conditions or property characteristics', false, false),
    ('38', 'Transfer that was forced or under duress; transfer that was to prevent foreclosure (occurs prior to date shown in judgment order for public sale)', false, true),
    ('39', 'Transfer in which the consideration paid for real property is verified to be different than the consideration indicated by documentary stamps', false, false),
    ('40', 'Transfer in which the consideration paid for real property is verified to be significantly influenced by non-market financing or assumption of non-market lease', false, false),
    ('41', 'Other, including duplicate recordings and Rehabbed sales; requires approval', false, false),
    ('42', 'Transfer involving mortgage fraud per a law enforcement agency’s notification of probable cause', false, false),
    ('43', 'Transfer where the sale price (as the documentary stamps indicate) is verified to be an allocated price as part of a package or bulk transaction', false, false),
    ('98', 'Unable to process transfer because of transfer instrument errors (examples: incomplete or incorrect legal description, incorrect grantor)', false, false),
    ('99', 'Transfer was recorded or otherwise discovered in the previous 90 days and qualification decision is pending; invalid for transfers recorded or otherwise discovered more than 90 days earlier', false, false)
ON CONFLICT (qual_code) DO UPDATE 
SET label = EXCLUDED.label,
    is_market = EXCLUDED.is_market,
    is_distressed = EXCLUDED.is_distressed;
