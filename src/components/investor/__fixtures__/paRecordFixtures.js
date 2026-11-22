/**
 * Synthetic, name-free Property Appraiser text fixtures shaped like pdfjs output
 * (" | " = wide gap between table cells). Owner / mailing / grantor slots contain
 * only placeholder tokens so tests can prove they are stripped.
 */

export const OWNER_TOKENS = ['PLACEHOLDER-OWNER-A', 'PLACEHOLDER-OWNER-B', 'PLACEHOLDER-MAIL-1', 'PLACEHOLDER-MAIL-2', 'PLACEHOLDER-GRANTOR', 'PLACEHOLDER-GRANTEE'];

// Martin County (MCPA-style) — 18801 SE River Ridge Rd
export const MARTIN_FIXTURE = `
Martin County Property Appraiser
Parcel ID | 23-40-42-002-000-01070-1 | Account # | 99001
Property Address | 18801 SE RIVER RIDGE RD | Owner Information
PLACEHOLDER-OWNER-A
PLACEHOLDER-OWNER-B
Mailing Address | PLACEHOLDER-MAIL-1
PLACEHOLDER-MAIL-2
Legal Description
RIVER RIDGE PLAT LOT 107
Building Information
Year Built | Finished Area | Bedrooms | Full Baths | Half Baths
1988 | 4,307 | 3 | 7 | 0
Exterior Wall | WOOD FRAME/STUCCO | Roof Cover | CEMENT TILE
Roof Structure | HIP | Stories | 2
Neighborhood | 1407
Extra Features
Code | Description | Year Built | Units
PL1 | POOL RESIDENTIAL | 2026 | 148
DK2 | BOAT DOCK WOOD | 1998 | 362
FN1 | FENCE WOOD | 2005 | 220
Sales History
Sale Date | Sale Price | Grantor | Deed Type | Book/Page
03/14/2019 | $2,150,000 | PLACEHOLDER-GRANTOR | WD | 3045/1120
11/02/2004 | $1,875,000 | PLACEHOLDER-GRANTOR | WD | 1960/0221
07/15/1986 | $385,000 | PLACEHOLDER-GRANTOR | WD | 0712/1450
Value History
Year | Land Value | Improvement Value | Market Value | Assessed Value
2026 | $1,450,000 | $1,353,500 | $2,803,500 | $1,900,000
2025 | $1,400,000 | $1,250,000 | $2,650,000 | $1,850,000
2010 | $700,000 | $650,000 | $1,350,000 | $1,100,000
`;

// Broward County (BCPA-style) — 360 Holly Ln
export const BROWARD_FIXTURE = `
Broward County Property Appraiser
Property Summary
Property ID: | 5041 02 03 0600 | Millage | 0312
Property Owner(s): | PLACEHOLDER-OWNER-A
PLACEHOLDER-OWNER-B
Mailing Address: | PLACEHOLDER-MAIL-1
PLACEHOLDER-MAIL-2
Physical Address: | 360 HOLLY LN
Abbreviated Legal Description | PLANTATION PARK 45-12 B LOT 9 BLK 3
Use: | 01-01 Single Family
Adj. Bldg. S.F. (Card, Sketch) | 2,145
Under Air S.F. | 1,862
Eff./Act. Year Built: | 1975/1963
Units/Beds/Baths | 1/3/2
Property Assessment Values
Year | Land | Building / Improvement | Just / Market Value | Assessed / SOH Value | Tax
2026 | $286,800 | $312,450 | $599,250 | $412,870 | $8,940
2025 | $270,000 | $300,100 | $570,100
Sales History for this Parcel
Date | Type | Price | Book/Page or CIN
1/12/2021 | WD-Q | $505,000 | PLACEHOLDER-GRANTEE | 117045678
6/3/1998 | WD | $139,900 | 28412/1123
`;

// Ambiguous / label-free text: nothing here is confidently labelled.
export const AMBIGUOUS_FIXTURE = `
Some property printout
POOL DECK FLAT ROOF OVER PATIO 1992 2,400
4 3 2 1988
`;

// Palm Beach County (PAPA-style) — 309 Cascade Ln (New build 2025)
export const PALM_BEACH_FIXTURE = `
Property Print | 11/21/26, 7:53 PM
Property Detail
Parcel Control Number: | 54-43-42-27-04-000-2680 | Location Address: 309 CASCADE LN
Municipality: | PALM BEACH SHORES
Property Use Code: | 0100 - SINGLE FAMILY | Zoning: | A - SINGLE FAMILY RESIDENTIAL
Legal Description: | PALM BEACH SHORES LT 268 | Total SF: | 4228 | Acres .20
Property Owner: | PLACEHOLDER-OWNER-A
Mailing Address: | PLACEHOLDER-MAIL-1 | PLACEHOLDER-MAIL-2
2026 Values | 2026 Taxes
Improvement Value | $1,220,536
Land Value | $800,000 Ad Valorem | $39,631
Non Ad Valorem | $215
Total Market Value | $2,020,536
Total Tax | $39,846
Assessed Value | $1,979,536
Building Footprint (Building 1 ) | Subarea and Square Footage (Building 1 )
1
Description | Area Sq. Footage o f
FUS Finished Upper Story | 1616 | 1
BAS Base Area | 1884
FOP Finished Open Porch | 54
FOP Finished Open Porch | 168
FGR Finished Garage | 506
Total Square Footage : 4228
Total Area Under Air : 3500
Extra Features
Description | Year Built Unit
Pool - In-Ground | 2025 | 1
Structural Details (Building 1)
Description
1 Bldg Type | EXC-RESIDENT
2 Exterior Wall 1 | MSY: CB STUCCO
3 Year Built | 2025
4 Air Condition Desc. | HTG & AC
5 Heat Type | FORCED AIR DUCT
6 Heat Fuel | ELECTRIC
7 Bed Rooms | 4
8 Full Baths | 3
9 Half Baths | 1
10 Roof Structure | WOOD TRUSS
11 Roof Cover | CONCRETE TILE
12 Interior Wall 1 | DRYWALL
13 Floor Type 1 | CERAMIC/QUARRY TILE
14 Stories | 2
PALM BEACH COUNTY PROPERTY APPRAISER www.pbcgov.org/PAPA
`;

