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

