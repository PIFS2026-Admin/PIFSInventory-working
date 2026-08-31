-- Tubing Job Board imported from WTX Pathfinder Yard Progress (Trello).
-- Run supabase/titan_service_line_boards.sql first. This migration is safe to rerun.

begin;

insert into public.service_boards (board_key, service_line_key, name, description, active)
values ('tubing', 'tubing', 'Tubing Job Board', 'Live Tubing job tracking from incoming work through waterblast, inspection, repairs, invoicing, and completion.', true)
on conflict (board_key) do update
set service_line_key = excluded.service_line_key,
    name = excluded.name,
    description = excluded.description,
    active = true;

with target_board as (
  select id from public.service_boards where board_key = 'tubing'
), lane_seed (column_key, title, description, color, sort_order) as (
  values
    ('trello_6894d35f9aaca6803946dbc7', 'Incoming Jobs (Last TU-112)', 'Tubing jobs in Incoming Jobs (Last TU-112).', '#7dd3fc', 100),
    ('trello_6894d371b4603d109775aabf', 'Queue for Waterblasting', 'Tubing jobs in Queue for Waterblasting.', '#fb923c', 200),
    ('trello_69a5e4160ec61ce1ce8097bb', 'Water-Blast In-Progress', 'Tubing jobs in Water-Blast In-Progress.', '#facc15', 300),
    ('trello_69a1a73dfd248fae8d712436', 'Queue for Inspection/Worked', 'Tubing jobs in Queue for Inspection/Worked.', '#a78bfa', 400),
    ('trello_6894d37be2523cb8aa26cdc9', 'In Progress for Inspection/Worked', 'Tubing jobs in In Progress for Inspection/Worked.', '#34d399', 500),
    ('trello_6a3019c1294831539f7172e4', 'ON HOLD - NEED TO FINISH COMPLETE JOB', 'Tubing jobs in ON HOLD - NEED TO FINISH COMPLETE JOB.', '#38bdf8', 600),
    ('trello_69a5e57605f42be5e690ae81', 'Yard VS Building Verification', 'Tubing jobs in Yard VS Building Verification.', '#f472b6', 700),
    ('trello_69cc187698d18054da616a77', 'Needs Invoice and to send to customer', 'Tubing jobs in Needs Invoice and to send to customer.', '#94a3b8', 800),
    ('trello_69a5edde99384cffb553d786', 'After Inspection Repairs (hardbands/machineshop)', 'Tubing jobs in After Inspection Repairs (hardbands/machineshop).', '#7dd3fc', 900),
    ('trello_6894d3816e12817e38a73bd1', 'Completed', 'Tubing jobs in Completed.', '#fb923c', 1000),
    ('trello_6a3412a5ccd86392af9c1e1c', 'Completed Post Inspections', 'Tubing jobs in Completed Post Inspections.', '#facc15', 1100),
    ('trello_6a3412af1c45362c4c3b9aac', 'Completed Pre-shipments', 'Tubing jobs in Completed Pre-shipments.', '#a78bfa', 1200),
    ('trello_6a3412f2d30f70143ef1360e', 'Completed Waterblast Only', 'Tubing jobs in Completed Waterblast Only.', '#34d399', 1300),
    ('trello_6a341314b6baefbc4e48bee8', 'Completed BHAs', 'Tubing jobs in Completed BHAs.', '#38bdf8', 1400)
)
insert into public.service_board_columns (board_id, column_key, title, description, color, sort_order, active)
select target_board.id, lane_seed.column_key, lane_seed.title, lane_seed.description, lane_seed.color, lane_seed.sort_order, true
from target_board
cross join lane_seed
on conflict (board_id, column_key) do update
set title = excluded.title,
    description = excluded.description,
    color = excluded.color,
    sort_order = excluded.sort_order,
    active = true;

-- Preserve any manually created cards from the old placeholder lanes by moving them to the first imported lane.
with target_board as (
  select id from public.service_boards where board_key = 'tubing'
), incoming_lane as (
  select c.id
  from public.service_board_columns c
  join target_board b on b.id = c.board_id
  where c.column_key = 'trello_6894d35f9aaca6803946dbc7'
)
update public.service_board_cards card
set column_id = incoming_lane.id
from target_board, incoming_lane, public.service_board_columns old_lane
where card.board_id = target_board.id
  and old_lane.id = card.column_id
  and old_lane.column_key in ('requested', 'scheduled', 'in_progress', 'review', 'complete')
  and coalesce(card.source_type, '') <> 'seed';

delete from public.service_board_cards card
using public.service_boards board
where card.board_id = board.id
  and board.board_key = 'tubing'
  and card.source_type = 'seed';

update public.service_board_columns lane
set active = false
from public.service_boards board
where lane.board_id = board.id
  and board.board_key = 'tubing'
  and lane.column_key in ('requested', 'scheduled', 'in_progress', 'review', 'complete');

with target_board as (
  select id from public.service_boards where board_key = 'tubing'
), card_seed (column_key, source_id, title, description, priority, due_date, sort_order, tags) as (
  values
    ('trello_6a3412af1c45362c4c3b9aac', '69d010511c7c1cbc6bea220e', 'FT#66403) CP Energy Blow out, re-dope and cap on 225 jts of 2 3/8 FSS-247', '', 'Normal', null::date, 100, array['Tubing', 'Split string', 'Invoice Completed']::text[]),
    ('trello_6a3412af1c45362c4c3b9aac', '69d00c137e6c42f8515a2232', '(FT#66403) CP Energy Blow out, re-dope and cap on 1,052 jts 2 7/8 FSS-265', '', 'Normal', null::date, 200, array['Tubing', 'Split string', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_6a3412af1c45362c4c3b9aac', '69d55a8e05fcd4cc42f76dd7', '(FT#66477) Long String Clean Dope and Cap 89 joints of 2 7/8 PH6', '', 'Normal', null::date, 300, array['Invoice Completed']::text[]),
    ('trello_6a3412af1c45362c4c3b9aac', '69d7e0539eb2b880968a21f3', '(FT#66671) Turnkey Pre-Shipment/ Blow out, re-dope and cap 604 joints of 2 7/8 PH6', '', 'Normal', null::date, 400, array['Tubing', 'Invoice Completed']::text[]),
    ('trello_6a3412a5ccd86392af9c1e1c', '69bd63d909d4c0163069252e', '(FT#65753) CP Energy Post Inspection on 154 joints of 2 3/8 FSS-247 and 46 joints of 2 7/8 FSS-265', 'Trello attachments
- 65753 CP ENERGY POST INSP. 2 78 summary.pdf: https://trello.com/1/cards/69bd63d909d4c0163069252e/attachments/69e8e401fb684f4a50d946d2/download/65753_CP_ENERGY_POST_INSP._2_78_summary.pdf
- 65753 CP ENERGY POST INSP. 2 38 SUMMARY.pdf: https://trello.com/1/cards/69bd63d909d4c0163069252e/attachments/69e8e41bf0df27e646f1e8c0/download/65753_CP_ENERGY_POST_INSP._2_38_SUMMARY.pdf', 'Normal', null::date, 100, array['Split string', 'Inspection summary/ Yard verification Completed', 'Inspection completed', 'Post Inspection', 'Invoice Completed']::text[]),
    ('trello_6a3412af1c45362c4c3b9aac', '69dfaabbe4f65bea21d749e7', '(FT#67001) CP Energy Pre-Shipment/ Blow out,dope and cap on 15 joints of 2 7/8 FSS-265', '', 'Normal', null::date, 500, array['Tubing', 'Inspection completed', 'Invoice Completed']::text[]),
    ('trello_6a3412a5ccd86392af9c1e1c', '69cc182e2c070b19387dfb13', 'CP Energy (FT#66298) Post inspection on 280 joints of 2 7/8 FSS-265 and 54 joints of 2 3/8 FSS-247', 'Trello attachments
- CP Post Inspection FT#66298 4-1-26 summary.pdf: https://trello.com/1/cards/69cc182e2c070b19387dfb13/attachments/69e8e19c9f954efbda25c54a/download/CP_Post_Inspection_FT%2366298_4-1-26_summary.pdf
- CP Post Inspection FT#66298 4-1-26 report.pdf: https://trello.com/1/cards/69cc182e2c070b19387dfb13/attachments/69e8e1afba58294ecaa69751/download/CP_Post_Inspection_FT%2366298_4-1-26_report.pdf', 'Normal', null::date, 200, array['Post Inspection', 'Inspection completed', 'Tubing', 'Invoice Completed']::text[]),
    ('trello_6a3412af1c45362c4c3b9aac', '69e8d106b47b593e1c27a79a', '(FT#67255) CP Energy/Blow out, re dope and cap 735 joints of 2 7/8 FSS-265 and 192 joints of 2 3/8 FSS-247', '', 'Normal', null::date, 600, array['Tubing', 'Split string', 'Invoice Completed']::text[]),
    ('trello_6a3412a5ccd86392af9c1e1c', '69d50d334cfe27ea21e82239', 'FT#66558 / CP Energy Post Inspection on 180 joints of 2 7/8 FSS-265', '', 'Normal', null::date, 300, array['Inspection completed', 'Invoice Completed', 'Post Inspection']::text[]),
    ('trello_6a3412af1c45362c4c3b9aac', '69f118f8d1f75e61b4f1deb3', '(FT#67536) Turnkey/Pre-Shipment Blow out, dope and cap 635 joints of 2 7/8 PH6', 'Trello attachments
- TURNKEY PRE4-29-26  67536.xlsm: https://trello.com/1/cards/69f118f8d1f75e61b4f1deb3/attachments/6a1c6f5558c82b141a29daf6/download/TURNKEY_PRE4-29-26__67536.xlsm', 'Normal', null::date, 700, array['Inspection completed', 'Invoice Completed']::text[]),
    ('trello_6a3412a5ccd86392af9c1e1c', '69d80b18082854202992c47a', '(FT#66674) CP Energy Post inspection on (180) joints of 2 7/8 FSS-265', 'Trello attachments
- 66674 summary.pdf: https://trello.com/1/cards/69d80b18082854202992c47a/attachments/69e8ddf5aa5f882de4c3f84b/download/66674_summary.pdf
- 66674 report.pdf: https://trello.com/1/cards/69d80b18082854202992c47a/attachments/69e8de06aae1b84577e23f63/download/66674_report.pdf', 'Normal', null::date, 400, array['Post Inspection', 'Tubing', 'Invoice Completed']::text[]),
    ('trello_6a3412af1c45362c4c3b9aac', '69dfb01e0f8023ee7572710b', '(FT#67004) CP Energy Pre-Shipment/ Blow out, dope and cap on 630 joints of 2 7/8 PH6', '', 'Normal', null::date, 800, array['Tubing', 'Inspection completed', 'Waterblast Completed', 'Invoice Completed']::text[]),
    ('trello_6a3412a5ccd86392af9c1e1c', '69e9326367df2711cdbdbe32', '(FT#67270) CP Energy/Post inspection on 160 joints of 2 3/8 FSS-247', 'Trello attachments
- 4-24-26 FT#67270 cp post summary.pdf: https://trello.com/1/cards/69e9326367df2711cdbdbe32/attachments/69fb919a559ba79c5180ab7b/download/4-24-26_FT%2367270_cp_post_summary.pdf
- 4-24-26 FT#67270 cp post report.pdf: https://trello.com/1/cards/69e9326367df2711cdbdbe32/attachments/69fb91c3a555093de1becba5/download/4-24-26_FT%2367270_cp_post_report.pdf', 'Normal', null::date, 500, array['Tubing', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Post Inspection', 'Invoice Completed']::text[]),
    ('trello_6a3412af1c45362c4c3b9aac', '69de97f1ba294dec75c35190', '(FT#66967) CP Energy/ Blow out +Drift + Dope & Cap on 646 joints of 2 7/8 PH6 (will use this for remainder of ph6 to get ready) This will be billed to Turnkey', '', 'Normal', null::date, 900, array['Tubing', 'Inspection summary/ Yard verification Completed', 'Inspection completed', 'Invoice Completed']::text[]),
    ('trello_6a3412a5ccd86392af9c1e1c', '69f0c203f3d7b80b9a8f099e', '(FT#67488) CP Energy Post Inspection on 160 joints of 2 3/8 FSS247', 'Trello attachments
- CP ENERGY POST  #67488  4.28.26 FSS247 report.pdf: https://trello.com/1/cards/69f0c203f3d7b80b9a8f099e/attachments/69fb9128bda43064fa6dd418/download/CP_ENERGY_POST__%2367488__4.28.26_FSS247_report.pdf
- CP ENERGY POST  #67488  4.28.26 FSS247 summary.pdf: https://trello.com/1/cards/69f0c203f3d7b80b9a8f099e/attachments/69fb9151c47e0668819b3ea7/download/CP_ENERGY_POST__%2367488__4.28.26_FSS247_summary.pdf', 'Normal', null::date, 600, array['Tubing', 'Split string', 'Inspection completed', 'Invoice Completed']::text[]),
    ('trello_6a3412af1c45362c4c3b9aac', '69fcf066940daba1470f1018', '(FT#68005) CP Energy Pre-Shipment Blacklight connections on 630- 2 7/8 PH6 before shipping joints out.', '', 'Normal', null::date, 1000, array['Tubing', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_6a3412a5ccd86392af9c1e1c', '69f0f32d0aa15b15a6894e5a', '(FT#67488) CP Energy Post Inspection on 110 joints of 2 7/8 FSS265', 'Trello attachments
- CP ENERGY POST  #67488  4.28.26 FSS265 Report.pdf: https://trello.com/1/cards/69f0f32d0aa15b15a6894e5a/attachments/69fb9010c81e84293630c09e/download/CP_ENERGY_POST__%2367488__4.28.26_FSS265_Report.pdf
- CP ENERGY POST  #67488  4.28.26 FSS265 summary.pdf: https://trello.com/1/cards/69f0f32d0aa15b15a6894e5a/attachments/69fb902651de0a475b6be9dc/download/CP_ENERGY_POST__%2367488__4.28.26_FSS265_summary.pdf', 'Normal', null::date, 700, array['Tubing', 'Split string', 'Inspection completed', 'Post Inspection', 'Invoice Completed']::text[]),
    ('trello_6a3412af1c45362c4c3b9aac', '69fe0261acf4a1e52f41ad57', '(FT#68036) Turnkey Pre-shipment UT on 100 joints of 2 7/8 PH6', 'Trello attachments
- Turnkey Pre Ship #68036.xlsm: https://trello.com/1/cards/69fe0261acf4a1e52f41ad57/attachments/6a1c6ef168c3cb7ddc67d70f/download/Turnkey_Pre_Ship_%2368036.xlsm', 'Normal', null::date, 1100, array['Tubing', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_6a3412a5ccd86392af9c1e1c', '69fb3f437c0567ebadec7b7b', '(FT#67835)CP Energy Post Inspection on 160 joints of 2 7/8" FSS-265', 'Trello attachments
- CP ENERGY POST #67835 summary.pdf: https://trello.com/1/cards/69fb3f437c0567ebadec7b7b/attachments/6a1c6f1432bcaf063a95057c/download/CP_ENERGY_POST_%2367835_summary.pdf
- CP ENERGY POST #67835 report.pdf: https://trello.com/1/cards/69fb3f437c0567ebadec7b7b/attachments/6a1c6f1466eac263d66df79f/download/CP_ENERGY_POST_%2367835_report.pdf', 'Normal', null::date, 800, array['Tubing', 'Post Inspection', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_6a3412af1c45362c4c3b9aac', '69ff99fe986767c5dbd56c4d', '(FT#68093) CP Energy Pre-shipment Blow out, re-dope and cap 600 joints of 2 3/8 FSS247 and 310 joints of 2 7/8 FSS265', '', 'Normal', null::date, 1200, array['Tubing', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_6a3412f2d30f70143ef1360e', '69c6a64575a139aafee8cb8e', 'PMR/Akita 801 (FT#65917) Waterblast/Pressure Wash 466-R2/339-R3 5.5 DP', '', 'Normal', null::date, 100, array['Waterblast Completed', 'Invoice Completed']::text[]),
    ('trello_6a3412a5ccd86392af9c1e1c', '69f2718175486b8fa515d011', '(FT#67574) CP Energy Post Inspection on 130 joints of 2 7/8" FSS265', 'Trello attachments
- CP POST #67574  5.2.26 SUMMARY FSS265.pdf: https://trello.com/1/cards/69f2718175486b8fa515d011/attachments/6a1c6eb8cd0421c43a0b41ec/download/CP_POST_%2367574__5.2.26_SUMMARY_FSS265.pdf
- CP POST #67574  5.2.26 REPORT FSS265.pdf: https://trello.com/1/cards/69f2718175486b8fa515d011/attachments/6a1c6eb939c5325ef8fee10c/download/CP_POST_%2367574__5.2.26_REPORT_FSS265.pdf', 'Normal', null::date, 900, array['Split string', 'Tubing', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Post Inspection', 'Invoice Completed']::text[]),
    ('trello_6a3412af1c45362c4c3b9aac', '69f50d097cf4611e02b86ebf', '(FT#67665) Turnkey Rattle, Drift, Dope and Cap on 100 Joints of 2 7/8 PH6 and UT 635 joints', 'Trello attachments
- Turnkey pre #67665.xlsm: https://trello.com/1/cards/69f50d097cf4611e02b86ebf/attachments/6a1c6edaf8693002b62cb5a3/download/Turnkey_pre_%2367665.xlsm', 'Normal', null::date, 1300, array['Tubing', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_6a3412f2d30f70143ef1360e', '69caf15a566dec792b1a1f32', 'Bullet Pipe FT#66202 Water blasting 373 joints of 2 7/8 Ph6', '', 'Normal', null::date, 200, array['Tubing', 'Waterblast Completed', 'Invoice Completed']::text[]),
    ('trello_6a3412a5ccd86392af9c1e1c', '69f27119a54d719c0ca05606', '(FT#67574) CP Energy Post Inspection on 35 joints of 2 3/8" FSS247', 'Trello attachments
- CP POST #67574  5.2.26 REPORT FSS247.pdf: https://trello.com/1/cards/69f27119a54d719c0ca05606/attachments/6a1c6e56e3516c7a0dd37842/download/CP_POST_%2367574__5.2.26_REPORT_FSS247.pdf
- CP POST #67574  5.2.26 SUMMARY FSS247.pdf: https://trello.com/1/cards/69f27119a54d719c0ca05606/attachments/6a1c6e568a52b1eab02ad2f4/download/CP_POST_%2367574__5.2.26_SUMMARY_FSS247.pdf', 'Normal', null::date, 1000, array['Tubing', 'Split string', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Post Inspection', 'Invoice Completed']::text[]),
    ('trello_6a3412af1c45362c4c3b9aac', '6a063f2817a908b018d9dc36', '(FT#68303) CP Energy Pre-shipment Blow out, re dope and cap 658 joints of 2 7/8 FSS-265', '', 'Normal', null::date, 1400, array['Tubing', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_6a3412f2d30f70143ef1360e', '69e938c598bf9d8aa4cabae9', '(FT#67207) Smith Brothers Pipe /we will be waterblasting 230 joints of 27/8 L80 8 round tubing. Quoted $12 we will not be cleaning thread protectors. charge unloading fee. Needs within 3 to 4 days.', '', 'Normal', null::date, 300, array['Tubing', 'Waterblast Completed', 'Invoice Completed']::text[]),
    ('trello_6894d371b4603d109775aabf', '6a9183091293f7b1a016fee8', '(TU-112/FT#73085) Boyd McWilliams / CAT 3 + Waterblast +Drift on 217 joints of 2 7/8 EUE 8RD', '', 'Normal', null::date, 100, array[]::text[]),
    ('trello_69a5e57605f42be5e690ae81', '6a8da5b2d3b39e704396a243', '(TU-109/FT#72994) CP Energy (FT#2356) CAT 3 + Waterblast + Drift on 310 joints of 2 7/8 PH6', 'Trello attachments
- TU-109 Material Movement and BOL.pdf: https://trello.com/1/cards/6a8da5b2d3b39e704396a243/attachments/6a8df24ba33b8d65507715ac/download/TU-109_Material_Movement_and_BOL.pdf', 'Normal', null::date, 100, array['Waterblast Completed', 'Inspection completed']::text[]),
    ('trello_6a3412a5ccd86392af9c1e1c', '6a023e3c64359f29101d4e9a', '(FT#68163) CP Energy Post inspection  150 joints of 2-7/8 FSS-265', '', 'Normal', null::date, 1100, array['Tubing', 'Post Inspection', 'Invoice Completed']::text[]),
    ('trello_6a3412af1c45362c4c3b9aac', '6a032bfeef598f1e42e69fd1', '(FT#68178) CP Energy Pre-shipment Blow out, re dope and cap 570 joints of 2 7/8 FSS-265', '', 'Normal', null::date, 1500, array['Tubing', 'Invoice Completed']::text[]),
    ('trello_6a3412f2d30f70143ef1360e', '6a01d8cb1edd119cc88ced0d', '(FT#68068) Smith Brothers Pipe we will be water blasting 228 joints of 27/8 L80 bare 8 round EUE tubing, no doping but capping, with brand new thread protectors supplied by Smith bros 

they would like this to Be done within two days of arrival', '', 'Normal', null::date, 400, array['Tubing', 'Waterblast Completed', 'Invoice Completed']::text[]),
    ('trello_69a5e4160ec61ce1ce8097bb', '6a90b2e6e9fe9f3bad6707ed', '(TU-110/FT#73183) CP Energy (FT#2358) CAT 3 + Waterblast + Drift on 350 joints of 2 3/8 Spearhead', '', 'Normal', null::date, 100, array[]::text[]),
    ('trello_69a5e57605f42be5e690ae81', '6a835d6bab66c1355512b49d', '(TU-104/FT#72837) CP Energy (FT#2350) CAT 3 + Waterblast + Drift + Blacklight on 752 joints of 2 7/8 FSS-265', 'Trello attachments
- TU-104 Material Movement and BOL.pdf: https://trello.com/1/cards/6a835d6bab66c1355512b49d/attachments/6a84af6fb026e01b4843c652/download/TU-104_Material_Movement_and_BOL.pdf', 'Normal', null::date, 200, array['Waterblast Completed', 'Inspection completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6894d618026eb610c0b18843', '(TU-001) Cp Energy Spraberry Unit Victory 106  Clean, Visual, end drift, clean protectors and re-dope and cap  493- 2 7/8 FSS 265  Date: 7-30-25 Time: 7am  Location: Pathfinder Yard', 'Do a complete inspection on this string upon return and add to TU-004 open job.

Trello attachments
- TU-001 BOL 1.pdf: https://trello.com/1/cards/6894d618026eb610c0b18843/attachments/69cd33aab969cd642243385d/download/TU-001_BOL_1.pdf
- T-001 summary 2.pdf: https://trello.com/1/cards/6894d618026eb610c0b18843/attachments/69cd33cb7f61ff6f1674db8f/download/T-001_BOL_2.pdf
- REPORT CP ENERGY FT#1912 FT 57175 TU001.pdf: https://trello.com/1/cards/6894d618026eb610c0b18843/attachments/69cfce29aa7bee8e01bf0ed0/download/REPORT_CP_ENERGY_FT%231912_FT_57175_TU001.pdf
- SUMMARY CP ENERGY FT#1912 FT 57175 TU001.pdf: https://trello.com/1/cards/6894d618026eb610c0b18843/attachments/69cfdac64cecfca5eaf58b79/download/SUMMARY_CP_ENERGY_FT%231912_FT_57175_TU001.pdf', 'Normal', null::date, 100, array['Tubing', 'Waterblast Completed', 'Inspection completed', 'Inspection summary/ Yard verification Completed']::text[]),
    ('trello_6a3412a5ccd86392af9c1e1c', '6a2c0fe219e4ad43f1d56a73', 'CP Energy Post Inspection (FT#69403) 105 joints of 2 7/8 FSS-265, 61 joints of 2 3/8 FSS-247, 205 joints of 2 7/8 FSS-265', 'Trello attachments
- CP POST 69403 FSS247 REPORT.pdf: https://trello.com/1/cards/6a2c0fe219e4ad43f1d56a73/attachments/6a2ff4065ce08fe2356e8c53/download/CP_POST_69403_FSS247_REPORT.pdf
- CP POST 69403 FSS247 summary.pdf: https://trello.com/1/cards/6a2c0fe219e4ad43f1d56a73/attachments/6a2ff4064e5cd3e86cbd871b/download/CP_POST_69403_FSS247_summary.pdf
- CP POST 69403 FSS265 SUMMARY.pdf: https://trello.com/1/cards/6a2c0fe219e4ad43f1d56a73/attachments/6a2ff414205cd8ae9a5353e2/download/CP_POST_69403_FSS265_SUMMARY.pdf
- CP POST 69403 FSS265 REPORT.pdf: https://trello.com/1/cards/6a2c0fe219e4ad43f1d56a73/attachments/6a2ff414896e49c7f294d3e7/download/CP_POST_69403_FSS265_REPORT.pdf
- CP POST 69403 PH6 SUMMARY.pdf: https://trello.com/1/cards/6a2c0fe219e4ad43f1d56a73/attachments/6a2ff42096f6a122ae33dc3a/download/CP_POST_69403_PH6_SUMMARY.pdf
- CP POST 69403 PH6 REPORT.pdf: https://trello.com/1/cards/6a2c0fe219e4ad43f1d56a73/attachments/6a2ff42080af8d3f88be2755/download/CP_POST_69403_PH6_REPORT.pdf', 'Normal', null::date, 1200, array['Post Inspection', 'Inspection completed', 'Invoice Completed']::text[]),
    ('trello_6a3412af1c45362c4c3b9aac', '6a2c1031de23579e8129af8d', '(FT#69479) CP Energy Pre-shipment on 1315 joints of 2 7/8 FSS-265, 225 joints of 2 3/8 FSS-247', '', 'Normal', null::date, 1600, array['Pre-Shipment', 'Inspection completed', 'Invoice Completed']::text[]),
    ('trello_6a3412f2d30f70143ef1360e', '6a307f3e9d4b488b0da9ec7c', 'FT#69630 Tower Tools Waterblast 380 joints of 2 7/8 PH6', '', 'Normal', null::date, 500, array['Waterblast Completed', 'Invoice Completed']::text[]),
    ('trello_6a341314b6baefbc4e48bee8', '69d6abf4b2c42e9a4a975a66', '(FT#66646) CP Energy Clean, Visual, and blacklight +/- 30 subs', 'Trello attachments
- CP Energy Sub 2183 #66646 SUMMARY.pdf: https://trello.com/1/cards/69d6abf4b2c42e9a4a975a66/attachments/69e8df1641a2b6f075fdc3ca/download/CP_Energy_Sub_2183_%2366646_SUMMARY.pdf
- CP ENERGY SUBS 2187 #66646 REPORT.pdf: https://trello.com/1/cards/69d6abf4b2c42e9a4a975a66/attachments/69e8df2c69800f043cd11639/download/CP_ENERGY_SUBS_2187_%2366646_REPORT.pdf
- 66646 Inspection Summary.pdf: https://trello.com/1/cards/69d6abf4b2c42e9a4a975a66/attachments/69e8e015a40f9dafc0953e54/download/66646_Inspection_Summary.pdf', 'Normal', null::date, 100, array['Tubing', 'Invoice Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6894d759e2c4c293c1b74e59', '(TU-002) Turnkey  TU-Tubing  Rattle Ids 656 -2 7/8” tubing (ph-6) Basket of tools Date:8-3-25  Ds-1 Cat.3 inspection  Date:8-4-25 Time:7am Location:Pathfinder Yard', 'Trello attachments
- TU-002 BOL 1.pdf: https://trello.com/1/cards/6894d759e2c4c293c1b74e59/attachments/69cd3d4b77754d2ab9853dbf/download/TU-002_BOL_1.pdf
- TU-002 BOL2.pdf: https://trello.com/1/cards/6894d759e2c4c293c1b74e59/attachments/69cd3d5c8d4dcb0b8bcbb0a0/download/TU-002_BOL2.pdf
- TU-002 BOL 3.pdf: https://trello.com/1/cards/6894d759e2c4c293c1b74e59/attachments/69cd3d6b5838014654e310c6/download/TU-002_BOL_3.pdf
- TU-002 BOL 4.pdf: https://trello.com/1/cards/6894d759e2c4c293c1b74e59/attachments/69cd3d725b85947d276a431e/download/TU-002_BOL_4.pdf
- TU-002 BOL 5.pdf: https://trello.com/1/cards/6894d759e2c4c293c1b74e59/attachments/69cd3d7ba6e45f87bc687f70/download/TU-002_BOL_5.pdf
- TU-002 BOL 6.pdf: https://trello.com/1/cards/6894d759e2c4c293c1b74e59/attachments/69cd3d8251f9b87133bcdce8/download/TU-002_BOL_6.pdf
- TU-002 BOL 7.pdf: https://trello.com/1/cards/6894d759e2c4c293c1b74e59/attachments/69cd3d898189d3cee15f3741/download/TU-002_BOL_7.pdf
- TU-002 BOL 8.pdf: https://trello.com/1/cards/6894d759e2c4c293c1b74e59/attachments/69cd3d91bb2659f42daa90ec/download/TU-002_BOL_8.pdf
- TU-002 BOL 9.pdf: https://trello.com/1/cards/6894d759e2c4c293c1b74e59/attachments/69cd3dc327d16ec31c55aab9/download/TU-002_BOL_9.pdf
- TU-002 BOL 10.pdf: https://trello.com/1/cards/6894d759e2c4c293c1b74e59/attachments/69cd3dcb471f7aa23dbb6fe6/download/TU-002_BOL_10.pdf
- TU-002 Summary.pdf: https://trello.com/1/cards/6894d759e2c4c293c1b74e59/attachments/69cd3dd18181944b2b1ea460/download/TU-002_Summary.pdf', 'Normal', null::date, 200, array['Tubing']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6894d78ef943dd066b7c89a7', '(TU-003) Turnkey  Kaiser Francis Diversified 3 TU-Tubing  Rattle Ids 569 -2 7/8” tubing (ph-6) Basket of tools  Date:8-4-25 Time:12 pm Location:Pathfinder Yard DSI Cat 3 Inspection 8-6-25', 'Trello attachments
- TU-003 BOL 1.pdf: https://trello.com/1/cards/6894d78ef943dd066b7c89a7/attachments/69cd40402f9b77c5a449a62f/download/TU-003_BOL_1.pdf
- TU-003 BOL 2.pdf: https://trello.com/1/cards/6894d78ef943dd066b7c89a7/attachments/69cd4047423c5e2f42a5e65e/download/TU-003_BOL_2.pdf
- TU-003 BOL 3.pdf: https://trello.com/1/cards/6894d78ef943dd066b7c89a7/attachments/69cd404e66d61b27f2d33a07/download/TU-003_BOL_3.pdf
- TU-003 Summary.pdf: https://trello.com/1/cards/6894d78ef943dd066b7c89a7/attachments/69cd4053a7012aa3c71b070d/download/TU-003_Summary.pdf', 'Normal', null::date, 300, array['Tubing']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6894d687b100c46c20caac51', '(TU-004/FT#57522) Cp Energy Exxon/Pioneer Victory 106 Spraberry Unit  DS-1 Cat.3 Inspection + Blacklight Upgrade Inspection associated with (CP Energy FT 1912) on 62 joints remaining in yard. This FT will remain open until 493 joints of 2.875 FSS-265 returns.  62- 2.875 FSS 265  Date: 8-2-25 Time: 7am  493- 2.875 FSS 265 Potentially 2.375 will return also Date: Unknown Currently  Location: Pathfinder Yard', 'Trello attachments
- TU-004 BOL 1.pdf: https://trello.com/1/cards/6894d687b100c46c20caac51/attachments/69cd45640c73ec930e217020/download/TU-004_BOL_1.pdf
- TU-004 BOL 2.pdf: https://trello.com/1/cards/6894d687b100c46c20caac51/attachments/69cd4570daa7247872bcb832/download/TU-004_BOL_2.pdf
- TU-004 BOL 3.pdf: https://trello.com/1/cards/6894d687b100c46c20caac51/attachments/69cd4578dbef772e6e956cef/download/TU-004_BOL_3.pdf
- TU-004 Summary.pdf: https://trello.com/1/cards/6894d687b100c46c20caac51/attachments/69cd459a13ab3e39da0ded2f/download/TU-004_Summary.pdf
- REPORT CP ENERGY FT#57691 8-13-25 TU 004 .pdf: https://trello.com/1/cards/6894d687b100c46c20caac51/attachments/69cfced80e0842dbf1421cca/download/REPORT_CP_ENERGY_FT%2357691_8-13-25_TU_004_.pdf
- TU004 REPORT CP ENERGY FT1912A FT#57691 8-13-25.pdf: https://trello.com/1/cards/6894d687b100c46c20caac51/attachments/69cfcee1cf7f1e881fcfe29d/download/TU004_REPORT_CP_ENERGY_FT1912A_FT%2357691_8-13-25.pdf
- REPORT CP ENERGY FT#57691 8-13-25 TU 004 .pdf: https://trello.com/1/cards/6894d687b100c46c20caac51/attachments/69cfd08ebac1365f25e5dbe3/download/REPORT_CP_ENERGY_FT%2357691_8-13-25_TU_004_.pdf', 'Normal', null::date, 400, array['Tubing']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '689fcac613e0310468f6a3fe', '(TU-005/FT#57824) Cp Energy (FT 5042) Right 360 / Mike Coy Stout Pad / Rattle IDs / DS-1 Cat.3 Inspection + Blacklight on 619 joints of 2.785 FSS-265 Rattle begins 8/15/25 , Inspection begins 8/16/25 Time: 7AM Location: Pathfinder Yard / Building B', 'Trello attachments
- TU-005 Incoming.pdf: https://trello.com/1/cards/689fcac613e0310468f6a3fe/attachments/69cd4905d0ef488dd35d2e96/download/TU-005_Incoming.pdf
- TU-005 Summary.pdf: https://trello.com/1/cards/689fcac613e0310468f6a3fe/attachments/69cd490d8c9ed8e410653733/download/TU-005_Summary.pdf
- TU005 SUMMARY CP ENERGY FT#57824 8-16-25 + subs.pdf: https://trello.com/1/cards/689fcac613e0310468f6a3fe/attachments/69cfd0d1eeef2e7e0c021daa/download/TU005_SUMMARY_CP_ENERGY_FT%2357824_8-16-25_%2B_subs.pdf
- TU005 REPORT CP ENERGY FT#57824 8-16-25 + subs.pdf: https://trello.com/1/cards/689fcac613e0310468f6a3fe/attachments/69cfd0dd506955778d2f0feb/download/TU005_REPORT_CP_ENERGY_FT%2357824_8-16-25_%2B_subs.pdf', 'Normal', null::date, 500, array['Tubing']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '68b0ba83ba769576fc04514b', '(TU-006) Turnkey | Kaiser Francis | Blus 405H | Diversified 3 | TU-Tubing  643 -2 7/8” tubing (ph-6) Date: 8-25-25 DS1 Cat 3 + Rattle & Drift Ids begins 8-27-25 Time: 8 AM Location: Pathfinder Yard Inspection begins 8-28-25 Building B', '', 'Normal', null::date, 600, array['Tubing']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '68bb0e511ef56cb2343df5c6', '(TU-007/FT#58568) CP Energy (FT#1929) Fisher Erwin 10M 113H DS-1 Cat-3 Inspection + Blacklight + Rattle & Drift IDs on 652 joints of 2.785 FSS-265 & 160 joints of 2.375 FSS-247. FSS-265 Rattle begins 9/4/25 Time: 7AM Location: Pathfinder Yard Inspection will begin 9/6/25', 'Trello attachments
- TU-007 BOL 1.pdf: https://trello.com/1/cards/68bb0e511ef56cb2343df5c6/attachments/69cd4e721bf9d6602a2c600e/download/TU-007_BOL_1.pdf
- TU-007 Summary.pdf: https://trello.com/1/cards/68bb0e511ef56cb2343df5c6/attachments/69cd4e7d9e8f42b19cdbfe9a/download/TU-007_Summary.pdf
- TU007 SUMMARY CP ENERGY_1929 2.875 FSS265  FT#58568.pdf: https://trello.com/1/cards/68bb0e511ef56cb2343df5c6/attachments/69cfd1320736663e77c1aa34/download/TU007_SUMMARY_CP_ENERGY_1929_2.875_FSS265__FT%2358568.pdf
- TU007 REPORT CP ENERGY_1929 2.875 FSS265 FT#58568.pdf: https://trello.com/1/cards/68bb0e511ef56cb2343df5c6/attachments/69cfd13aef9e39346ade9209/download/TU007_REPORT_CP_ENERGY_1929_2.875_FSS265_FT%2358568.pdf', 'Normal', null::date, 700, array['Tubing']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '68c03cc2dc39d99e35c2c098', '(TU-008 / FT#58751 ) CP Energy / SM Energy / Rattle & Drift IDs / DS-1 Cat-3 + Blacklight on 220 joints of 2.375 FSS-247 / Rattle set to begin 9/10/25 Time: 7AM Location: Pathfinder Yard Inspection will follow', 'Trello attachments
- TU-008 BOL 1.pdf: https://trello.com/1/cards/68c03cc2dc39d99e35c2c098/attachments/69cd611b269ac69297485d9f/download/TU-008_BOL_1.pdf
- TU-008 BOL 2.pdf: https://trello.com/1/cards/68c03cc2dc39d99e35c2c098/attachments/69cd6125cfb18c07eed9940f/download/TU-008_BOL_2.pdf
- TU-008 Summary.pdf: https://trello.com/1/cards/68c03cc2dc39d99e35c2c098/attachments/69cd612cd5758c7e69d22f59/download/TU-008_Summary.pdf
- TU008 CP Energy_5046 2.375 FSS247 FT#59008.pdf: https://trello.com/1/cards/68c03cc2dc39d99e35c2c098/attachments/69cfdeb4c7b71b55ff57580a/download/TU008_CP_Energy_5046_2.375_FSS247_FT%2359008.pdf
- TU008 CP Energy_5046 2.375 FSS247 FT#59008 2.pdf: https://trello.com/1/cards/68c03cc2dc39d99e35c2c098/attachments/69cfdebdb080835af461bf66/download/TU008_CP_Energy_5046_2.375_FSS247_FT%2359008_2.pdf', 'Normal', null::date, 800, array['Tubing']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '68fa64b2774d1a4fb8c66442', '(TU-009/FT#59940) CP Energy (FT#1970) Hufnagel 3H VTI on 372 joints of 2.785 FSS-265 & 534 joints of 2.375 FSS-247. Upgrade inspection 42 joints of 2.375 FSS-265 & 69 joints of 2.875 FSS-265', 'Trello attachments
- TU-009 BOL.pdf: https://trello.com/1/cards/68fa64b2774d1a4fb8c66442/attachments/69cd631f03d4a652fcd40564/download/TU-009_BOL.pdf
- TU-009 BOL 2.pdf: https://trello.com/1/cards/68fa64b2774d1a4fb8c66442/attachments/69cd632696c906f93a2c9372/download/TU-009_BOL_2.pdf
- TU-009 Summary.pdf: https://trello.com/1/cards/68fa64b2774d1a4fb8c66442/attachments/69cd632eee3b444b77666a6f/download/TU-009_Summary.pdf
- TU009 CP ENERGY_FT1970-FT59940 2.375FSS247 Summary.pdf: https://trello.com/1/cards/68fa64b2774d1a4fb8c66442/attachments/69cfe1885a83ac367c871802/download/TU009_CP_ENERGY_FT1970-FT59940_2.375FSS247_Summary.pdf
- TU009 CP ENERGY_FT1970-FT59940 2.375FSS247 Report.pdf: https://trello.com/1/cards/68fa64b2774d1a4fb8c66442/attachments/69cfe1ad7b07406c74b0fcd3/download/TU009_CP_ENERGY_FT1970-FT59940_2.375FSS247_Report.pdf', 'Normal', null::date, 900, array['Tubing']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '69039a4614730a5ca3c0d6ae', '(TU-010 / FT#60707 / DT#15805749) Weatherford / Jonah / Jackson Unit 14H / DS-1 Cat-3 +Waterblast + Screw Gauge + Drift on 350 joints of 2.875 PH6 Washing Start: 10/27/25 Inspection Start: 10/28/25 Time: 7:30AM', 'Trello attachments
- TU-010 Summary.pdf: https://trello.com/1/cards/69039a4614730a5ca3c0d6ae/attachments/69cd64b0c0c8b6cae037e922/download/TU-010_Summary.pdf
- TU-010 BOL.pdf: https://trello.com/1/cards/69039a4614730a5ca3c0d6ae/attachments/69cd64b7bc1c3b615c34644c/download/TU-010_BOL.pdf
- TU010 10-28-25 WEATHERFORD.pdf: https://trello.com/1/cards/69039a4614730a5ca3c0d6ae/attachments/69e8e66d30969104b544ed79/download/TU010_10-28-25_WEATHERFORD.pdf', 'Normal', null::date, 1000, array['Tubing']::text[]),
    ('trello_6a3412f2d30f70143ef1360e', '6a6296ce28bea2553395d7e2', '(FT#71531) Smith Bros Pipe Waterblast + dope and cap on 224 joints of 2 7/8 EUE', '', 'Normal', null::date, 600, array['Inspection completed', 'Inspection summary/ Yard verification Completed', 'Waterblast Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '69260669a3077b4684810276', '(TU-011 / FT#60778) Apache / Schawlbe Unit 2H / 405 joints of 2 7/8 PH6 DS-1 Cat 3 Inspection Cancelled due to Concrete in the IDs', 'Trello attachments
- TU-011 BOL.pdf: https://trello.com/1/cards/69260669a3077b4684810276/attachments/69cd71ac28d1ac0c5d155feb/download/TU-011_BOL.pdf
- TU-011 Summary.pdf: https://trello.com/1/cards/69260669a3077b4684810276/attachments/69cd7f20753aabc4b12e50ce/download/TU-011_Summary.pdf
- TU-011 BOL.pdf: https://trello.com/1/cards/69260669a3077b4684810276/attachments/69cd7f2b97ff165e8eeaba47/download/TU-011_BOL.pdf', 'Normal', null::date, 1100, array['Tubing']::text[]),
    ('trello_6a3412f2d30f70143ef1360e', '6a6296ef5844d34cad6ecb42', '(FT#71537) Tower Tools Waterblast + dope and cap 1,084 joints of 2 7/8 HT6', '', 'Normal', null::date, 700, array['Waterblast Completed', 'Inspection completed', 'Invoice Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '692607dd9ed3673f771f8b02', '(TU-012 / FT# DT#) Weatherford / Old Hickory State 1503H / DS-1 Cat 3 + Waterblast + Screw Gauge + Drift on 270 joints of 2 7/8 PH6 Washing Starts: 11/25/25 Inspection Starts: 11/26/25', 'Trello attachments
- TU-012 Summary.pdf: https://trello.com/1/cards/692607dd9ed3673f771f8b02/attachments/69cd80d71bf7e5d69669d5f5/download/TU-012_Summary.pdf
- TU-012 BOL.pdf: https://trello.com/1/cards/692607dd9ed3673f771f8b02/attachments/69cd80defae6a20cc60cce98/download/TU-012_BOL.pdf
- TU012 11-26-25  WFT FT#61749.pdf: https://trello.com/1/cards/692607dd9ed3673f771f8b02/attachments/69e8e7a2fb7c323c71604d04/download/TU012_11-26-25__WFT_FT%2361749.pdf', 'Normal', null::date, 1200, array['Tubing']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6929d5880712049805bd5cc1', '(TU-013 / FT#61806) CP Energy (FT#2010) Monarch Lease 28-33 / DS-1 Cat-3 + Waterblast + Drift on 650 joints of 2 7/8 FSS-265 Cleaning Begin: 11/26/25 Inspection Begin: 11/28/25', 'Trello attachments
- TU-013 BOL.pdf: https://trello.com/1/cards/6929d5880712049805bd5cc1/attachments/69cd84d3a4d37fecdbe19c0e/download/TU-013_BOL.pdf
- TU-013 3.pdf: https://trello.com/1/cards/6929d5880712049805bd5cc1/attachments/69cd84de35a0d2e8dac610b7/download/TU-013_3.pdf
- TU-013 Summary.pdf: https://trello.com/1/cards/6929d5880712049805bd5cc1/attachments/69cd84fed4594a979974fa9c/download/TU-013_Summary.pdf
- TU-013 CP ENERGY FT#2010 11-28-25 (1).pdf: https://trello.com/1/cards/6929d5880712049805bd5cc1/attachments/69e8ed168d5b6b0c343b618b/download/TU-013_CP_ENERGY_FT%232010_11-28-25_(1).pdf
- 11.28.2025_61806_2.875 Inch Tubing Inspection_CP Energy Ft#2010.pdf: https://trello.com/1/cards/6929d5880712049805bd5cc1/attachments/69e8ed25c018531da79a146f/download/11.28.2025_61806_2.875_Inch_Tubing_Inspection_CP_Energy_Ft%232010.pdf', 'Normal', null::date, 1300, array['Tubing']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '693c4839ac7e437b70ed8f3a', '(TU-014 / FT#62083) CP Energy (FT#2018) University Location / DS-1 Cat 3 + Waterblast + Drift on 653 joints of 2 7/8 FSS-265 Cleaning Begins: 12/6/25 Inspection Begins: 12/15/25', 'Trello attachments
- TU-014 Summary.pdf: https://trello.com/1/cards/693c4839ac7e437b70ed8f3a/attachments/69cd876e842e00d413527df3/download/TU-014_Summary.pdf
- TU-014 BOL 1.pdf: https://trello.com/1/cards/693c4839ac7e437b70ed8f3a/attachments/69cd877658882940e7ab313f/download/TU-014_BOL_1.pdf
- TU-014 BOL 2.pdf: https://trello.com/1/cards/693c4839ac7e437b70ed8f3a/attachments/69cd877d20e082abf8bf9dbb/download/TU-014_BOL_2.pdf', 'Normal', null::date, 1400, array['Tubing']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '693c4bc0551d41238dc98f89', '(TU-015 / FT#62220) CP Energy (FT#2017) University Location / DS-1 Cat 3 + Rattle + Drift on 667 joints of 2 7/8 FSS-265 Rattle Begin: 12/11/25 Inspection Begin: 12/12', 'Trello attachments
- TU-015 Summary.pdf: https://trello.com/1/cards/693c4bc0551d41238dc98f89/attachments/69cd8dc7d6ff73f8f70a934d/download/TU-015_Summary.pdf
- TU-015 BOL 1.pdf: https://trello.com/1/cards/693c4bc0551d41238dc98f89/attachments/69cd8dcf9af1694bba63213b/download/TU-015_BOL_1.pdf
- TU-015 BOL 2.pdf: https://trello.com/1/cards/693c4bc0551d41238dc98f89/attachments/69cd8e1003a2dc97189c2bfb/download/TU-015_BOL_2.pdf
- TU015 12-10-25 CP Energy_2017 FT#62220.pdf: https://trello.com/1/cards/693c4bc0551d41238dc98f89/attachments/69e8ef3b95c6fed9ebb1b196/download/TU015_12-10-25_CP_Energy_2017_FT%2362220.pdf
- TU015 12-10-25 CP Energy_2017 FT#62220.pdf: https://trello.com/1/cards/693c4bc0551d41238dc98f89/attachments/69e8ef755ebbbccfcb6351de/download/TU015_12-10-25_CP_Energy_2017_FT%2362220.pdf', 'Normal', null::date, 1500, array['Tubing']::text[]),
    ('trello_69a1a73dfd248fae8d712436', '6a32fe010cd753c3a798e6ac', 'CP Energy Clean and Visual on 10% of 628 joints of 2 7/8 FSS-265 and 189 joints of 2 3/8 FSS-247', '', 'Normal', null::date, 100, array[]::text[]),
    ('trello_6894d3816e12817e38a73bd1', '696a6b19c88739b9e752b6d3', '(TU-016 / FT#62359) CP Energy (FT#2032) Sage Brush 3H / DS-1 Cat 3 + Blacklight + Waterblast + Drift on 564 joints of 2 7/8 FSS-265', 'Trello attachments
- TU-016 Summary.pdf: https://trello.com/1/cards/696a6b19c88739b9e752b6d3/attachments/69cd8f652da2c7c9ab81308c/download/TU-016_Summary.pdf
- TU-016 BOL.pdf: https://trello.com/1/cards/696a6b19c88739b9e752b6d3/attachments/69cd8f71e813139fb26f8422/download/TU-016_BOL.pdf
- TU-016 12-17-25 CP ENERGY #62359 REVISED REPORT.pdf: https://trello.com/1/cards/696a6b19c88739b9e752b6d3/attachments/69cfe3f2b8112d05187f216b/download/TU-016_12-17-25_CP_ENERGY_%2362359_REVISED_REPORT.pdf
- TU-016 12-17-25 CP ENERGY #62359 REVISED SUMMARY.pdf: https://trello.com/1/cards/696a6b19c88739b9e752b6d3/attachments/69cfe40a32aee1a00d82c41b/download/TU-016_12-17-25_CP_ENERGY_%2362359_REVISED_SUMMARY.pdf', 'Normal', null::date, 1600, array['Tubing', 'Washed', 'Inspection summary/ Yard verification Completed']::text[]),
    ('trello_69a1a73dfd248fae8d712436', '6a79c51185807fde6cdd5f56', 'CP Energy Clean and Visual on 10% of 36 joints of 2 7/8 FSS-265 and 373 joints of 2 3/8 FSS-247', '', 'Normal', null::date, 200, array[]::text[]),
    ('trello_6894d3816e12817e38a73bd1', '696aa9a704a704150ad78ae0', '(TU-017 / FT#62972) CP Energy (FT#2045) Catarus Energy / AIG 307H - 407H / DS-1 Cat 3 + Blacklight + Waterblast + Drift on 1,190 joints of 2 7/8 FSS-265', 'Missing Thread Protectors

2 7/8 - 206 pins, 159 boxes

Trello attachments
- TU-017 BOL 1.pdf: https://trello.com/1/cards/696aa9a704a704150ad78ae0/attachments/69cd925be2678b46a85acf14/download/TU-017_BOL_1.pdf
- TU-017 Summary.pdf: https://trello.com/1/cards/696aa9a704a704150ad78ae0/attachments/69cd9265842e00d413684e2f/download/TU-017_Summary.pdf
- CP Energy FT2045 TU-017 2-17-26 FT#62972 SUMMARY.pdf: https://trello.com/1/cards/696aa9a704a704150ad78ae0/attachments/69cfe4a8ed6aa807427307ec/download/CP_Energy_FT2045_TU-017_2-17-26_FT%2362972_SUMMARY.pdf
- CP Energy FT2045 TU-017 2-17-26 FT#62972 REPORT.pdf: https://trello.com/1/cards/696aa9a704a704150ad78ae0/attachments/69cfe4b4330d81d8d698db12/download/CP_Energy_FT2045_TU-017_2-17-26_FT%2362972_REPORT.pdf', 'Normal', null::date, 1700, array['Tubing']::text[]),
    ('trello_69a1a73dfd248fae8d712436', '6a90b37d73ba749368cf2795', '(TU-111/FT#NA) Long String / Swordfish / CAT 3 + Waterblast + Drift on 179 joints of 2 7/8 PH6', '', 'Normal', null::date, 300, array[]::text[]),
    ('trello_6894d3816e12817e38a73bd1', '699ccb100a4fd6095c582e28', '(TU-018 / FT#63106) CP Energy (FT#5072) Blue Print / DS-1 CAT 3 + Blacklight + Drift on 455 joints of 2 7/8 FSS-265 & 510 joints of 2 3/8 FSS-247', 'Trello attachments
- TU-018 BOL 1.pdf: https://trello.com/1/cards/699ccb100a4fd6095c582e28/attachments/69cd9478f04dd4d76f0e4a53/download/TU-018_BOL_1.pdf
- TU-018 summary.pdf: https://trello.com/1/cards/699ccb100a4fd6095c582e28/attachments/69ce6e12a2a8c0828df45a6f/download/TU-018_summary.pdf
- TU018 CP Energy_FT5072  445 jnts-2.875 FSS265 SUMMARY.pdf: https://trello.com/1/cards/699ccb100a4fd6095c582e28/attachments/69cfe7b2aed4be6456b93b54/download/TU018_CP_Energy_FT5072__445_jnts-2.875_FSS265_SUMMARY.pdf
- TU018 CP Energy_FT5072  445 jnts-2.875 FSS265 REPORT.pdf: https://trello.com/1/cards/699ccb100a4fd6095c582e28/attachments/69cfe7c256060896f97141a2/download/TU018_CP_Energy_FT5072__445_jnts-2.875_FSS265_REPORT.pdf
- TU018 CP Energy FT_5072 2.375 FSS247 1-19-26 summary.pdf: https://trello.com/1/cards/699ccb100a4fd6095c582e28/attachments/69cfe7cf5e09ec9c63c6ac2f/download/TU018_CP_Energy_FT_5072_2.375_FSS247_1-19-26_summary.pdf
- TU018 CP Energy FT_5072 2.375 FSS247 1-19-26 report.pdf: https://trello.com/1/cards/699ccb100a4fd6095c582e28/attachments/69cfe7dd31e42dbdc18d78e3/download/TU018_CP_Energy_FT_5072_2.375_FSS247_1-19-26_report.pdf', 'Normal', null::date, 1800, array['Tubing']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '699ccc1ad0efab958d8f548e', '(TU-019 / FT#63303) CP Energy (FT#5059) Blue Print / CAT 3 + Blacklight + Drift + Waterblast on 445 joints of 2 7/8 FSS-265 & 510 joints of 2 3/8 FSS-247', 'Trello attachments
- BOL.pdf: https://trello.com/1/cards/699ccc1ad0efab958d8f548e/attachments/69ce70947b586e3f49de95b2/download/BOL.pdf
- TU-019 Summary.pdf: https://trello.com/1/cards/699ccc1ad0efab958d8f548e/attachments/69ce709de6efe28847c5ff80/download/TU-019_Summary.pdf
- TU-019 CP Energy_FT5059  2.376 FSS247 FT#63303 1-23-26 summary.pdf: https://trello.com/1/cards/699ccc1ad0efab958d8f548e/attachments/69cfe8258be2a3fd4121c267/download/TU-019_CP_Energy_FT5059__2.376_FSS247_FT%2363303_1-23-26_summary.pdf
- TU-019 CP Energy_FT5059  2.376 FSS247 FT#63303 1-23-26 report.pdf: https://trello.com/1/cards/699ccc1ad0efab958d8f548e/attachments/69cfe834a66fd232d0d06d82/download/TU-019_CP_Energy_FT5059__2.376_FSS247_FT%2363303_1-23-26_report.pdf
- TU019 2.875 FSS265  report.pdf: https://trello.com/1/cards/699ccc1ad0efab958d8f548e/attachments/69cfe8441da12ad5eb425764/download/TU019_2.875_FSS265__report.pdf
- TU019 2.875 FSS265 summary.pdf: https://trello.com/1/cards/699ccc1ad0efab958d8f548e/attachments/69cfe8ddb081e9bab67f8227/download/TU019_2.875_FSS265_summary.pdf', 'Normal', null::date, 1900, array['Tubing']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '699cd1870a31f705343a4cd1', '(TU-020 / FT#63243) Tower Tools / Pre-Inspection + Machine Shop Re-Inspection on 185 joints of 2 7/8 HT-6', 'Trello attachments
- TU-020 Sumary.pdf: https://trello.com/1/cards/699cd1870a31f705343a4cd1/attachments/69ce716fe31bc8ce7a949a1c/download/TU-020_Sumary.pdf
- 1.11.2026_63243_2.875 Inch Tubing Pre-Inspection_Tower Tools.pdf: https://trello.com/1/cards/699cd1870a31f705343a4cd1/attachments/69e8f036bf1c81fb64409964/download/1.11.2026_63243_2.875_Inch_Tubing_Pre-Inspection_Tower_Tools.pdf
- 1.11.2026_63243_2.875 Inch Tubing Pre-Inspection_Tower Tools.pdf: https://trello.com/1/cards/699cd1870a31f705343a4cd1/attachments/69e8f05aa42048a23cb1a917/download/1.11.2026_63243_2.875_Inch_Tubing_Pre-Inspection_Tower_Tools.pdf', 'Normal', null::date, 2000, array['Tubing']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '699cd270809d85eb996970e0', '(TU-021 / FT#63757) CP Energy (FT#5049) Blue Print / CAT 3 + Blacklight + Waterblast + Drift on 365 joints of 2 3/8 FSS-247 and 549 joints of 2 7/8 FSS-265', 'Trello attachments
- TU-021 Summary.pdf: https://trello.com/1/cards/699cd270809d85eb996970e0/attachments/69ce720b1e42116bf41f52fc/download/TU-021_Summary.pdf
- TU-021 CP Energy sub FT#63903 summary.pdf: https://trello.com/1/cards/699cd270809d85eb996970e0/attachments/69cfea0be579e3e3d3c01e5d/download/TU-021_CP_Energy_sub_FT%2363903_summary.pdf
- TU-021 CP Energy sub FT#63903 report.pdf: https://trello.com/1/cards/699cd270809d85eb996970e0/attachments/69cfea145ae1f5b017c30c7d/download/TU-021_CP_Energy_sub_FT%2363903_report.pdf
- TU-021 CP Energy  FT5049 2.875 FSS265 FT#63757 CAT.3 PLUS BL SUMMARY.pdf: https://trello.com/1/cards/699cd270809d85eb996970e0/attachments/69cfea2a766c7c951dd46dc3/download/TU-021_CP_Energy__FT5049_2.875_FSS265_FT%2363757_CAT.3_PLUS_BL_SUMMARY.pdf
- TU-021 CP Energy  FT5049 2.875 FSS265 FT#63757 CAT.3 PLUS BL  REPORT.pdf: https://trello.com/1/cards/699cd270809d85eb996970e0/attachments/69cfea7f6d0d0812a84a6f83/download/TU-021_CP_Energy__FT5049_2.875_FSS265_FT%2363757_CAT.3_PLUS_BL__REPORT.pdf
- CP Energy TU-021 FT#63757 1-29-26 summary.pdf: https://trello.com/1/cards/699cd270809d85eb996970e0/attachments/69cfeab036a381d9baae0737/download/CP_Energy_TU-021_FT%2363757_1-29-26_summary.pdf
- CP Energy TU-021 FT#63757 1-29-26 report.pdf: https://trello.com/1/cards/699cd270809d85eb996970e0/attachments/69cfeab7946a42074fdd50f2/download/CP_Energy_TU-021_FT%2363757_1-29-26_report.pdf', 'Normal', null::date, 2100, array['Tubing', 'Split string']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '699dc35cb35ae06b22b82b60', '(TU-022 / FT63902) CP Energy (FT#2087) BPX / Landgrebe A7H / CAT 3 + Waterblast + Drift on 773 joints of 2 7/8 FSS-265', 'Trello attachments
- TU-022 BOL.pdf: https://trello.com/1/cards/699dc35cb35ae06b22b82b60/attachments/69ce7420f726139155addb37/download/TU-022_BOL.pdf
- TU-022 Summary.pdf: https://trello.com/1/cards/699dc35cb35ae06b22b82b60/attachments/69ce757924a314ee77e95f4d/download/TU-022_Summary.pdf
- TU022 CP ENERGY_FT2087 2.875 FSS265 SUMMARY.pdf: https://trello.com/1/cards/699dc35cb35ae06b22b82b60/attachments/69cfeb746030c4dba7c47607/download/TU022_CP_ENERGY_FT2087_2.875_FSS265_SUMMARY.pdf
- TU022 CP ENERGY_FT2087 2.875 FSS265 REPORT.pdf: https://trello.com/1/cards/699dc35cb35ae06b22b82b60/attachments/69cfeb7d313f5e638911363e/download/TU022_CP_ENERGY_FT2087_2.875_FSS265_REPORT.pdf', 'Normal', null::date, 2200, array['Tubing']::text[]),
    ('trello_6a3412f2d30f70143ef1360e', '6a689a28f44235e11cf218c7', 'FT#71671 Long-Strings waterblast, re-dope, and cap on 385 joints of 2 3/8 ph6', '', 'Normal', null::date, 800, array['Waterblast Completed', 'Invoice Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '699dc5293ea780aebab2c69b', '(TU-023 / FT#64247) Turnkey Kaiser Francis / Red Hills Unit #1 / CAT 3 + Waterblast + Drift on 436 joints of 2 7/8 PH6', 'Trello attachments
- TU-023 BOL.pdf: https://trello.com/1/cards/699dc5293ea780aebab2c69b/attachments/69ce74d326ebe29102fccc9d/download/TU-023_BOL.pdf
- TU-023 Summary.pdf: https://trello.com/1/cards/699dc5293ea780aebab2c69b/attachments/69ce74dd58f4353aa29c27b6/download/TU-023_Summary.pdf', 'Normal', null::date, 2300, array['Tubing']::text[]),
    ('trello_6a3412f2d30f70143ef1360e', '6a6b43ead5a44c7a6dcc7cbd', '(FT#71772) Longhorn Tubular Waterblast + Drift on 158 joints of 2 7/8 EUE 8RD', '', 'Normal', null::date, 900, array['Waterblast Completed', 'Invoice Completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a2ada422b967d6902625959', '05-27-26PF (TU-059/FT#68777) CP Energy (FT#2256) Exxon / Nail Burley 6L 712H / Ranger Rig 1482 / CAT 3 + Waterblast + Drift on 160 joints of 2 3/8 FSS-247', 'Trello attachments
- TU-059 Material Movement and BOL.pdf: https://trello.com/1/cards/6a2ada422b967d6902625959/attachments/6a2c0b792cd70db91e887d9c/download/TU-059_Material_Movement_and_BOL.pdf
- CP ENERGY FT#2256  TU-059  #68777 6.10.26 FSS247 SUMMARY.pdf: https://trello.com/1/cards/6a2ada422b967d6902625959/attachments/6a301927e41d9ad055515d42/download/CP_ENERGY_FT%232256__TU-059__%2368777_6.10.26_FSS247_SUMMARY.pdf
- CP ENERGY FT#2256  TU-059  #68777 6.10.26 FSS247 REPORT.pdf: https://trello.com/1/cards/6a2ada422b967d6902625959/attachments/6a301927a926e8d5a7a8d23a/download/CP_ENERGY_FT%232256__TU-059__%2368777_6.10.26_FSS247_REPORT.pdf', 'Normal', null::date, 100, array['Split string', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Waterblast Completed', 'Invoice Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '699dcb878076355b71e4274e', '(TU-024 / FT#64338) CP Energy / Panther Inspection / CAT 2 + End Drift + Screw Gauge on 880 joints of 2 3/8 FSS-247', 'Trello attachments
- TU-024 BOL.pdf: https://trello.com/1/cards/699dcb878076355b71e4274e/attachments/69ce78084351865226b20e7d/download/TU-024_BOL.pdf
- TU-024 Summary.pdf: https://trello.com/1/cards/699dcb878076355b71e4274e/attachments/69ce781a58474a26dc00d8ec/download/TU-024_Summary.pdf', 'Normal', null::date, 2400, array['Tubing']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a15ea30bb175024ff9c8daa', '05-27-26PG (TU-060/ FT#68779) Long Strings / Caribou 102H / CAT 3 + Waterblast + Drift on 353 joints of 2 7/8 PH6', 'Trello attachments
- TU-060 Material Movement and BOL.pdf: https://trello.com/1/cards/6a15ea30bb175024ff9c8daa/attachments/6a176cfdb4f5cc60196f7f0a/download/TU-060_Material_Movement_and_BOL.pdf
- TU-060 Material Movement and BOL(2).pdf: https://trello.com/1/cards/6a15ea30bb175024ff9c8daa/attachments/6a18c80cfdf45f0af280ec21/download/TU-060_Material_Movement_and_BOL(2).pdf
- Longstring TU-60  6.4.2026  68779 Summary.pdf: https://trello.com/1/cards/6a15ea30bb175024ff9c8daa/attachments/6a26fa01942ce66027774714/download/Longstring_TU-60__6.4.2026__68779_Summary.pdf
- Longstring TU-60  6.4.2026  68779 report.pdf: https://trello.com/1/cards/6a15ea30bb175024ff9c8daa/attachments/6a26fa022c4c06b94e744d66/download/Longstring_TU-60__6.4.2026__68779_report.pdf', 'Normal', null::date, 200, array['Inspection completed', 'Waterblast Completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a15e9dc89f47812c3be7836', '05-27-26PF (TU-059/FT#68777) CP Energy (FT#2256) Exxon / Nail Burley 6L 712H / Ranger Rig 1482 / CAT 3 + Waterblast + Drift on 658 joints of 2 7/8 FSS-265', 'Trello attachments
- TU-059 Material Movement and BOL.pdf: https://trello.com/1/cards/6a15e9dc89f47812c3be7836/attachments/6a176ce5b0925a50b2343d9c/download/TU-059_Material_Movement_and_BOL.pdf
- CP ENERGY FT#2256  TU-059  #68777 6.10.26 FSS265 SUMMARY.pdf: https://trello.com/1/cards/6a15e9dc89f47812c3be7836/attachments/6a30194bb3266e7196bba8c5/download/CP_ENERGY_FT%232256__TU-059__%2368777_6.10.26_FSS265_SUMMARY.pdf
- CP ENERGY FT#2256  TU-059  #68777 6.10.26 FSS265 REPORT.pdf: https://trello.com/1/cards/6a15e9dc89f47812c3be7836/attachments/6a30194cc53e8b991fe45415/download/CP_ENERGY_FT%232256__TU-059__%2368777_6.10.26_FSS265_REPORT.pdf', 'Normal', null::date, 300, array['Split string', 'Waterblast Completed', 'Inspection summary/ Yard verification Completed', 'Inspection completed', 'Invoice Completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a1db0ac857b7be520aac8db', 'CP ENERGY FSS247                                                           06-01-26PA (TU-062/FT#69088) CP Energy (FT#2250) CAT 3 + Waterblast + Drift on 351 joints of 2 7/8 FSS-265', 'Trello attachments
- 06-01-26PA, CP ENERGY 2250 TU062.xlsm: https://trello.com/1/cards/6a1db0ac857b7be520aac8db/attachments/6a1f52a8fd0a0b4b7fe22967/download/06-01-26PA%2C_CP_ENERGY_2250_TU062.xlsm
- TU-062 Material Movement and BOL(2).pdf: https://trello.com/1/cards/6a1db0ac857b7be520aac8db/attachments/6a1f52d8927eba0b9da6551e/download/TU-062_Material_Movement_and_BOL(2).pdf
- TU-062 Material Movement and BOL(3).pdf: https://trello.com/1/cards/6a1db0ac857b7be520aac8db/attachments/6a2c0b5966a04e272acbf6bb/download/TU-062_Material_Movement_and_BOL(3).pdf
- CP ENERGY FT 2250 TU-062 FSS265 6-13-2026  #69088 SUMMARY.pdf: https://trello.com/1/cards/6a1db0ac857b7be520aac8db/attachments/6a459beac25d94f5b0dd660b/download/CP_ENERGY_FT_2250_TU-062_FSS265_6-13-2026__%2369088_SUMMARY.pdf
- CP ENERGY FT 2250 TU-062 FSS265 6-13-2026  #69088 REPORT.pdf: https://trello.com/1/cards/6a1db0ac857b7be520aac8db/attachments/6a459bead8808dd437c0787e/download/CP_ENERGY_FT_2250_TU-062_FSS265_6-13-2026__%2369088_REPORT.pdf', 'Normal', null::date, 400, array['Split string', 'Waterblast Completed', 'Inspection summary/ Yard verification Completed', 'Inspection completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '699dcd0e567aa503f8cc9474', '(TU-025 / FT#64462) CP Energy (FT#2101) CP Energy / BPX / State Champ 0205H / CAT 3 + Blacklight + Waterblast on 338 joints of 2 7/8 FSS-265', 'Trello attachments
- TU-025 BOL.pdf: https://trello.com/1/cards/699dcd0e567aa503f8cc9474/attachments/69ce78c3043da538afbee11a/download/TU-025_BOL.pdf
- TU-025 Summary.pdf: https://trello.com/1/cards/699dcd0e567aa503f8cc9474/attachments/69ce78dadea792ada1d915fe/download/TU-025_Summary.pdf
- CP Energy_FT2102 TU-025 FT#64462 2-15-26 SUMMARY.pdf: https://trello.com/1/cards/699dcd0e567aa503f8cc9474/attachments/69cfed861f221bc3fc479592/download/CP_Energy_FT2102_TU-025_FT%2364462_2-15-26_SUMMARY.pdf
- CP Energy_FT2102 TU-025 FT#64462 2-15-26 REPORT.pdf: https://trello.com/1/cards/699dcd0e567aa503f8cc9474/attachments/69cfed8cfa12ce4d3e4fbbfa/download/CP_Energy_FT2102_TU-025_FT%2364462_2-15-26_REPORT.pdf
- CP Energy_FT2101 TU-025 FT#64462 2-15-26 REPORT.pdf: https://trello.com/1/cards/699dcd0e567aa503f8cc9474/attachments/69cfed9948c8ec81f56d8be2/download/CP_Energy_FT2101_TU-025_FT%2364462_2-15-26_REPORT.pdf
- CP Energy_FT2101 TU-025 FT#64462 2-15-26 SUMMARY.pdf: https://trello.com/1/cards/699dcd0e567aa503f8cc9474/attachments/69cfedac7f19bfa3b05c52a5/download/CP_Energy_FT2101_TU-025_FT%2364462_2-15-26_SUMMARY.pdf', 'Normal', null::date, 2500, array['Tubing']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a2c0f32e5fa9bcde63192f5', '06-01-26PA (TU-062/FT#69088) CP Energy (FT#2250) CAT 3 + Waterblast + Drift on 647 joints of 2 3/8 FSS-247', 'Trello attachments
- TU-062 Material Movement and BOL(3).pdf: https://trello.com/1/cards/6a2c0f32e5fa9bcde63192f5/attachments/6a2c1c8edd0253f7909b4cc2/download/TU-062_Material_Movement_and_BOL(3).pdf
- CP ENERGY FT69088 TU-062 FSS247 SUMMARY.pdf: https://trello.com/1/cards/6a2c0f32e5fa9bcde63192f5/attachments/6a459ac15f8ec402ffb1caaf/download/CP_ENERGY_FT69088_TU-062_FSS247_SUMMARY.pdf
- CP ENERGY FT69088 TU-062 FSS247 REPORT.pdf: https://trello.com/1/cards/6a2c0f32e5fa9bcde63192f5/attachments/6a459ac18bbed2ed336372fa/download/CP_ENERGY_FT69088_TU-062_FSS247_REPORT.pdf', 'Normal', null::date, 500, array['Split string', 'Waterblast Completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed', 'Inspection completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '699ef8d50e78f403a0366c51', '(TU-026 / FT#64463) CP Energy (FT#2106) Exxon / Brooks Location / CAT 3 + Blacklight + Waterblast + Drift on 762 joints of 2 7/8 FSS-265 and 160 joints of 2 3/8 FSS-247', 'Missing Thread Protectors:

2 7/8 - 163 Pins, 52 Boxes

2 3/8 - 36 Pins, 21 Boxes

Trello attachments
- TU-026 BOL.pdf: https://trello.com/1/cards/699ef8d50e78f403a0366c51/attachments/69ce7f69c748ab06a336ea28/download/TU-026_BOL.pdf
- TU-026 Summary.pdf: https://trello.com/1/cards/699ef8d50e78f403a0366c51/attachments/69ce83f526ebe2910217c356/download/TU-026_Summary.pdf
- TU-026 CP EnergyFT2106 FSS265  FT#64463 2-18-26 SUMMARY.pdf: https://trello.com/1/cards/699ef8d50e78f403a0366c51/attachments/69cfedf9f69e2d3b54cf3865/download/TU-026_CP_EnergyFT2106_FSS265__FT%2364463_2-18-26_SUMMARY.pdf
- TU-026 CP EnergyFT2106 FSS265  FT#64463 2-18-26 REPORT.pdf: https://trello.com/1/cards/699ef8d50e78f403a0366c51/attachments/69cfee045554ac4dec6c1c56/download/TU-026_CP_EnergyFT2106_FSS265__FT%2364463_2-18-26_REPORT.pdf
- TU-026 CP Energy FT2106 FSS247 FT#64463  2-23-26 SUMMARY.pdf: https://trello.com/1/cards/699ef8d50e78f403a0366c51/attachments/69cfee155f2c863f7b707afc/download/TU-026_CP_Energy_FT2106_FSS247_FT%2364463__2-23-26_SUMMARY.pdf
- TU-026 CP Energy FT2106 FSS247 FT#64463  2-23-26 REPORT.pdf: https://trello.com/1/cards/699ef8d50e78f403a0366c51/attachments/69cfee1cfc26138a96ba8949/download/TU-026_CP_Energy_FT2106_FSS247_FT%2364463__2-23-26_REPORT.pdf', 'Normal', null::date, 2600, array[]::text[]),
    ('trello_6894d3816e12817e38a73bd1', '69a1b603e5b9c2d91757e193', '(TU-027 / FT#64761) CP Energy (FT#2104) CAT 3 + Waterblast + Drift on 645 joints of 2 7/8 FSS-265', 'Missing Protectors

73 - Pins

9 - Boxes

Trello attachments
- TU-027 BOL 1.pdf: https://trello.com/1/cards/69a1b603e5b9c2d91757e193/attachments/69ce86c0dcb62072de5f5188/download/TU-027_BOL_1.pdf', 'High', null::date, 2700, array['Tubing', 'ON HOLD', 'Waterblast Completed', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '69a1b68d766df20225af639f', '(TU-028 / FT#64760) CP Energy (FT#2102) CP Energy / BPX / State Champ 106H / CAT 3 + Waterblast + Drift on 73 joints of 2 3/8 FSS-247 & 31 joints of 2 7/8 FSS-265 / ***added 471 joints of 2 7/8 FSS-265 and 452 joints of 2 3/8 FSS-247 from Snake Eyes Well***', 'Trello attachments
- TU-028 BOLs.pdf: https://trello.com/1/cards/69a1b68d766df20225af639f/attachments/69ce8418edcd2339d1cab235/download/TU-028_BOLs.pdf
- TU-028 Summary.pdf: https://trello.com/1/cards/69a1b68d766df20225af639f/attachments/69ce841f1ddecf87b5e6628a/download/TU-028_Summary.pdf
- CP Energy TU-028 FT#64760 2.875 2-21-26 SUMMARY.pdf: https://trello.com/1/cards/69a1b68d766df20225af639f/attachments/69cfee69a8aea686f3f351af/download/CP_Energy_TU-028_FT%2364760_2.875_2-21-26_SUMMARY.pdf
- CP Energy TU-028 FT#64760 2.875 2-21-26 REPORT.pdf: https://trello.com/1/cards/69a1b68d766df20225af639f/attachments/69cfee76a8aea686f3f37545/download/CP_Energy_TU-028_FT%2364760_2.875_2-21-26_REPORT.pdf
- CP Energy  TU-028 FT#64760 2.375 2-23-26 REPORT.pdf: https://trello.com/1/cards/69a1b68d766df20225af639f/attachments/69cfee80de098ddc8ae21878/download/CP_Energy__TU-028_FT%2364760_2.375_2-23-26_REPORT.pdf
- CP Energy  TU-028 FT#64760 2.375 2-23-26 SUMMARY.pdf: https://trello.com/1/cards/69a1b68d766df20225af639f/attachments/69cfee9722898a70966c0d26/download/CP_Energy__TU-028_FT%2364760_2.375_2-23-26_SUMMARY.pdf', 'Normal', null::date, 2800, array['Tubing', 'Split string', 'Waterblast Completed', 'Inspection completed', 'Inspection summary/ Yard verification Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '69a1b7c943ef1a5c50352457', '(TU-029 / FT#64398) Tower Tools / Continental / Hideaway 2WP / CAT 3 + Waterblast + Drift on 1100 joints of 2 7/8 HT-6 + Basket', 'Trello attachments
- TU-029 BOL.pdf: https://trello.com/1/cards/69a1b7c943ef1a5c50352457/attachments/69ce84522d0702bfdcd2b503/download/TU-029_BOL.pdf
- TU-029 Summary.pdf: https://trello.com/1/cards/69a1b7c943ef1a5c50352457/attachments/69ce8465f1ac70043879ff61/download/TU-029_Summary.pdf', 'Normal', null::date, 2900, array['Tubing', 'Waterblast Completed', 'Inspection completed', 'Inspection summary/ Yard verification Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '69a6e102ac1c1306b051eb9e', '(TU-030/FT#65106) CP Energy (FT2128) BPX / CAT 3 + Waterblast + Drift on +/- 331 joints of 2 7/8 FSS-265', 'Missing Protectors - NONE

Trello attachments
- TU-030 BOL.pdf: https://trello.com/1/cards/69a6e102ac1c1306b051eb9e/attachments/69ce84be7dbc8c107b64a56d/download/TU-030_BOL.pdf
- TU-030 Summary.pdf: https://trello.com/1/cards/69a6e102ac1c1306b051eb9e/attachments/69ce84c880bc19d3ffb74d5e/download/TU-030_Summary.pdf
- CP Energy TU-030 FT#65106 3-3-26 SUMMARY.pdf: https://trello.com/1/cards/69a6e102ac1c1306b051eb9e/attachments/69cfeeff45dadcc6e42de2d8/download/CP_Energy_TU-030_FT%2365106_3-3-26_SUMMARY.pdf
- CP Energy TU-030 FT#65106 3-3-26 REPORT.pdf: https://trello.com/1/cards/69a6e102ac1c1306b051eb9e/attachments/69cfef0b590d30c1ba9070f0/download/CP_Energy_TU-030_FT%2365106_3-3-26_REPORT.pdf', 'Normal', null::date, 3000, array['Waterblast Completed', 'Tubing', 'Inspection completed', 'Inspection summary/ Yard verification Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '69a79fc0c7725c708ab61cbf', '(TU-031/FT#65193) CP Energy (FT#2129) Sabalo / Ballagio 1JM / CAT 3 + Waterblast + Drift on 828 joints of 2 7/8 FSS-265', 'Missing Protectors

Boxes - 87

Pins - 134

Trello attachments
- TU-031 Inspection Summary.pdf: https://trello.com/1/cards/69a79fc0c7725c708ab61cbf/attachments/69de4dad196eb71d86d51ae6/download/TU-031_Inspection_Summary.pdf
- TU-031 Material Movement,BOL.pdf: https://trello.com/1/cards/69a79fc0c7725c708ab61cbf/attachments/69de4dc8bfcd0b47e2c6b7e7/download/TU-031_Material_Movement%2CBOL.pdf
- CP Energy TU-031 FT#65193 3-6-26 SUMMARY.pdf: https://trello.com/1/cards/69a79fc0c7725c708ab61cbf/attachments/69e8e2d6883f5758149331c5/download/CP_Energy_TU-031_FT%2365193_3-6-26_SUMMARY.pdf
- CP Energy TU-031 FT#65193 3-6-26 REPORT.pdf: https://trello.com/1/cards/69a79fc0c7725c708ab61cbf/attachments/69e8e2ed6494b39cb978f39d/download/CP_Energy_TU-031_FT%2365193_3-6-26_REPORT.pdf', 'Normal', null::date, 3100, array['Waterblast Completed', 'Inspection completed', 'Tubing', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '69a7a038409f4f6eb9a5e0de', '(TU-032/FT#65194) CP Energy (FT#2130) Sabalo / Ballagio 1MS / CAT 3 + Waterblast + Drift on 828 joints of 2 7/8 FSS-265', 'Missing Protectors

Boxes - 40

Pins - 178

Trello attachments
- TU-032 Inspection Summary.pdf: https://trello.com/1/cards/69a7a038409f4f6eb9a5e0de/attachments/69de4ebda7c9dffc7f23ec37/download/TU-032_Inspection_Summary.pdf
- TU-032 Material Movement, BOL.pdf: https://trello.com/1/cards/69a7a038409f4f6eb9a5e0de/attachments/69de4ecbd80c86e029d7b31c/download/TU-032_Material_Movement%2C_BOL.pdf
- CP Energy TU-032 FT65194 3-9-26 SUMMARY.pdf: https://trello.com/1/cards/69a7a038409f4f6eb9a5e0de/attachments/69e8e2253de71b65ebef0718/download/CP_Energy_TU-032_FT65194_3-9-26_SUMMARY.pdf
- CP Energy TU-032 FT65194 3-9-26 REPORT.pdf: https://trello.com/1/cards/69a7a038409f4f6eb9a5e0de/attachments/69e8e2424ebad37fc996cc40/download/CP_Energy_TU-032_FT65194_3-9-26_REPORT.pdf', 'Normal', null::date, 3200, array['Waterblast Completed', 'Inspection completed', 'Tubing', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '69b83676aab6811173182866', '(TU-033 / FT#65594) Ring Energy / Freddy Falcon 360 #1H / CAT 3 + Waterblast + Drift on 35 joints of 2 7/8 EUI Benoit', 'Trello attachments
- TU-033 Inspection Summary.pdf: https://trello.com/1/cards/69b83676aab6811173182866/attachments/69de50349ee97b71f01aa59f/download/TU-033_Inspection_Summary.pdf
- TU-033 Material Movement.pdf: https://trello.com/1/cards/69b83676aab6811173182866/attachments/69de5042a73823d463572381/download/TU-033_Material_Movement.pdf
- TU-033 Ring Energy(PMR) report.pdf: https://trello.com/1/cards/69b83676aab6811173182866/attachments/69e6840362e862413cb9143d/download/TU-033_Ring_Energy(PMR)_report.pdf
- TU-033 Ring Energy (PMR) FT#65594 SUMMARY (1).pdf: https://trello.com/1/cards/69b83676aab6811173182866/attachments/69e6840d8f718920e536d934/download/TU-033_Ring_Energy_(PMR)_FT%2365594_SUMMARY_(1).pdf
- Inspection Summary 2.pdf: https://trello.com/1/cards/69b83676aab6811173182866/attachments/69f3be4d675aad572ebcfb6a/download/Inspection_Summary_2.pdf', 'Normal', null::date, 3300, array['Waterblast Completed', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '69bd5e649cdfe4d8cbead45b', '(TU-034 / FT#65753) Ring Energy / CAT 3 + Waterblast + Drift on 39 joints of 2 7/8 EUE', 'Trello attachments
- TU-034 Material Movement.pdf: https://trello.com/1/cards/69bd5e649cdfe4d8cbead45b/attachments/69f3bf93d7828aa634fc3a4c/download/TU-034_Material_Movement.pdf
- 3.20.2026_65806_2.875 Inch Tubing Inspection_Ring Energy_PMR (1).pdf: https://trello.com/1/cards/69bd5e649cdfe4d8cbead45b/attachments/6a0b7234dadbb82e2c0becb0/download/3.20.2026_65806_2.875_Inch_Tubing_Inspection_Ring_Energy_PMR_(1).pdf
- 3.20.2026_65806_2.875 Inch Tubing Inspection_Ring Energy_PMR.pdf: https://trello.com/1/cards/69bd5e649cdfe4d8cbead45b/attachments/6a0b7236d14da40b9db622a2/download/3.20.2026_65806_2.875_Inch_Tubing_Inspection_Ring_Energy_PMR.pdf', 'Normal', null::date, 3400, array['Inspection summary/ Yard verification Completed', 'Inspection completed', 'Waterblast Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '69c5a710eb4eb1108e132d48', '(TU-035 FT#66045) Tower Tools / Continental / Whittenburg Location / CAT 3 + Waterblast + Drift on 982 joints of 2 7/8 HT-6. Blacklight only on 69 joints of Unused pipe', 'Trello attachments
- TU-035 Summaries.pdf: https://trello.com/1/cards/69c5a710eb4eb1108e132d48/attachments/69f3c2f3d5a01e877b22b745/download/TU-035_Summaries.pdf
- Material Movement and BOLs.pdf: https://trello.com/1/cards/69c5a710eb4eb1108e132d48/attachments/69f3c43ecddd42516cfe5c71/download/Material_Movement_and_BOLs.pdf
- Tower Tools Tu-035 FT#66045 3-2-26 summary.pdf: https://trello.com/1/cards/69c5a710eb4eb1108e132d48/attachments/69f3c4ab1b8063fb755ad918/download/Tower_Tools_Tu-035_FT%2366045_3-2-26_summary.pdf
- Tower Tools Tu-035 FT#66045 3-2-26 report.pdf: https://trello.com/1/cards/69c5a710eb4eb1108e132d48/attachments/69f3c4d7166d58ebc9c23889/download/Tower_Tools_Tu-035_FT%2366045_3-2-26_report.pdf
- Tower Tools Photos FT#66045.pdf: https://trello.com/1/cards/69c5a710eb4eb1108e132d48/attachments/69f3c4ef7371d215a9d782d6/download/Tower_Tools_Photos_FT%2366045.pdf
- Tower Tools Sub Report  #66045  3.31.2026 summary.pdf: https://trello.com/1/cards/69c5a710eb4eb1108e132d48/attachments/69f3c50d6b30f7b21c591b98/download/Tower_Tools_Sub_Report__%2366045__3.31.2026_summary.pdf
- Tower Tools Sub Report  #66045  3.31.2026 report 2.pdf: https://trello.com/1/cards/69c5a710eb4eb1108e132d48/attachments/69f3c56cb70d5b745bd2c037/download/Tower_Tools_Sub_Report__%2366045__3.31.2026_report_2.pdf', 'Normal', null::date, 3500, array['Tubing', 'Waterblast Completed', 'Inspection completed', 'Blacklight Only Completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '69caf0ad9e6fd49d1ad346f2', '(TU-036/FT#66047) CP Energy (FT#2166) / CAT 3 + Waterblast + Drift on 400 joints of 2 3/8 FSS-247', 'Missing Protectors

 140 Poxes

75 Pins

Trello attachments
- TU-036 Material Movement and BOL.pdf: https://trello.com/1/cards/69caf0ad9e6fd49d1ad346f2/attachments/69f3d0d265ca9cbf03800dcc/download/TU-036_Material_Movement_and_BOL.pdf
- TU-036 CP Energy FT#2166 FSS247  FT#66047 4-1-26 Summary.pdf: https://trello.com/1/cards/69caf0ad9e6fd49d1ad346f2/attachments/69f3d0f8e9e14fdab4d3fce2/download/TU-036_CP_Energy_FT%232166_FSS247__FT%2366047_4-1-26_Summary.pdf
- TU-036 CP Energy FT#2166 FSS247  FT#66047 4-1-26 Report.pdf: https://trello.com/1/cards/69caf0ad9e6fd49d1ad346f2/attachments/69f3d10a34a2f17f2a00adad/download/TU-036_CP_Energy_FT%232166_FSS247__FT%2366047_4-1-26_Report.pdf
- TU-036 4-9-26 CP ENERGY_FT2166 FSS265 FT#66047 2.875 FSS265 report.pdf: https://trello.com/1/cards/69caf0ad9e6fd49d1ad346f2/attachments/69f3d1290d4b6942b43d4f8a/download/TU-036_4-9-26_CP_ENERGY_FT2166_FSS265_FT%2366047_2.875_FSS265_report.pdf', 'High', null::date, 3600, array['Split string', 'Tubing', 'Waterblast Completed', 'ON HOLD', 'Invoice Completed', 'Inspection summary/ Yard verification Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '69c5a798133cb0fcf9015ecf', '(TU-036/FT#66047) CP Energy (FT#2166) / CAT 3 + Waterblast + Drift on 464 joints of 2 7/8 FSS-265', 'Missing Protectors

65 Pins

40 Boxes

Trello attachments
- TU-036 Material Movement and BOL.pdf: https://trello.com/1/cards/69c5a798133cb0fcf9015ecf/attachments/69f4b92fce2150c5dea1d304/download/TU-036_Material_Movement_and_BOL.pdf
- TU-036 CP Energy FT#2166 FSS247  FT#66047 4-1-26 Summary.pdf: https://trello.com/1/cards/69c5a798133cb0fcf9015ecf/attachments/69f4b9ada92df8ed56360c6c/download/TU-036_CP_Energy_FT%232166_FSS247__FT%2366047_4-1-26_Summary.pdf
- TU-036 CP Energy FT#2166 FSS247  FT#66047 4-1-26 Report.pdf: https://trello.com/1/cards/69c5a798133cb0fcf9015ecf/attachments/69f4b9c8475a2d7ad76ce2d3/download/TU-036_CP_Energy_FT%232166_FSS247__FT%2366047_4-1-26_Report.pdf
- TU-036 4-9-26 CP ENERGY_FT2166 FSS265 FT#66047 2.875 FSS265 report.pdf: https://trello.com/1/cards/69c5a798133cb0fcf9015ecf/attachments/69f4b9edb88c588d2bd32704/download/TU-036_4-9-26_CP_ENERGY_FT2166_FSS265_FT%2366047_2.875_FSS265_report.pdf', 'Normal', null::date, 3700, array['Tubing', 'Split string', 'Waterblast Completed', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '69d042eb7d3fa38284cbd837', '(TU-037/FT#66476) Long String / CAT 3 + Waterblast + Drift on 431 joints of 2 7/8 PH6', 'Missing Protectors

20 boxes

30 pins

Trello attachments
- Material Movement and BOL TU-037.pdf: https://trello.com/1/cards/69d042eb7d3fa38284cbd837/attachments/69f4bb989f051e255368912c/download/Material_Movement_and_BOL_TU-037.pdf
- TU-037 Longstring FT#66476 4-6-26 SUMMARY.pdf: https://trello.com/1/cards/69d042eb7d3fa38284cbd837/attachments/69f4bbc1dd6bd9bf8d62de51/download/TU-037_Longstring_FT%2366476_4-6-26_SUMMARY.pdf
- TU-037 Longstring FT#66476 4-6-26 REPORT.pdf: https://trello.com/1/cards/69d042eb7d3fa38284cbd837/attachments/69f4bbfc3749ab2fcbfb1098/download/TU-037_Longstring_FT%2366476_4-6-26_REPORT.pdf
- TU-037  Material Movement and BOL.pdf: https://trello.com/1/cards/69d042eb7d3fa38284cbd837/attachments/6a037f0c1bfbbb02793eafa3/download/TU-037__Material_Movement_and_BOL.pdf', 'Normal', null::date, 3800, array['Waterblast Completed', 'Tubing', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '69d50bc4d67280d6d494440a', '(TU-038/FT#66571) Long String / CAT 3 + Waterblast + Drift on 300 joints of 2 7/8 PH6', 'Missing Protectors

25 Pins

13 Boxes

Trello attachments
- TU-038 Material Movement.pdf: https://trello.com/1/cards/69d50bc4d67280d6d494440a/attachments/69f3cab7c6d87a7df9381315/download/TU-038_Material_Movement.pdf
- TU-038 Longstring FT#66571 4-7-26 report.pdf: https://trello.com/1/cards/69d50bc4d67280d6d494440a/attachments/69f3cad423d412b65bbd04da/download/TU-038_Longstring_FT%2366571_4-7-26_report.pdf
- TU-038 Longstring FT#66571 4-7-26 SUMMARY.pdf: https://trello.com/1/cards/69d50bc4d67280d6d494440a/attachments/69f3cb028dad343f562a9f3d/download/TU-038_Longstring_FT%2366571_4-7-26_SUMMARY.pdf
- Long strings TU038 pictures.docx: https://trello.com/1/cards/69d50bc4d67280d6d494440a/attachments/69f3cb42d7ce547eaf2b771e/download/Long_strings_TU038_pictures.docx', 'Normal', null::date, 3900, array['Tubing', 'Inspection completed', 'Waterblast Completed', 'Invoice Completed', 'Inspection summary/ Yard verification Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '69d50c64fb08ec71579ae99f', '(TU-039/FT#66572) Turnkey / Kaiser Francis / CAT 3 + Waterblast + Drift on 635 joints of 2 7/8 PH6 + basket', 'Trello attachments
- TU-039 Material Movement and  BOL.pdf: https://trello.com/1/cards/69d50c64fb08ec71579ae99f/attachments/69f3cc05a89784d3cba94c17/download/TU-039_Material_Movement_and__BOL.pdf
- 4-14-26 Turnkey FT#66572 sub summary.pdf: https://trello.com/1/cards/69d50c64fb08ec71579ae99f/attachments/69f3cc7a4825671324be1051/download/4-14-26_Turnkey_FT%2366572_sub_summary.pdf
- 4-14-26 Turnkey FT#66572 report.pdf: https://trello.com/1/cards/69d50c64fb08ec71579ae99f/attachments/69f3ccc3febe588f05519f21/download/4-14-26_Turnkey_FT%2366572_report.pdf
- 4-14-26 Turnkey FT#66572 sub report.pdf: https://trello.com/1/cards/69d50c64fb08ec71579ae99f/attachments/69f3cce593f901a93f452cda/download/4-14-26_Turnkey_FT%2366572_sub_report.pdf
- 4-14-26 Turnkey FT#66572 summary.pdf: https://trello.com/1/cards/69d50c64fb08ec71579ae99f/attachments/69f3cd247389c3cb88243198/download/4-14-26_Turnkey_FT%2366572_summary.pdf', 'Normal', null::date, 4000, array['Tubing', 'Waterblast Completed', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '69d67ce6750eefbd032db97e', '(TU-040/ FT#66640) Long String / Matador / Billy Burt 203 / CAT 3 + Waterblast + Drift on 353 joints +/- 2 3/8 PH6', 'Missing Protectors

40 pins

7 boxes

Trello attachments
- TU-40 Material Movement and BOLs.pdf: https://trello.com/1/cards/69d67ce6750eefbd032db97e/attachments/69f3ce64bd491d16e87cc0c2/download/TU-40_Material_Movement_and_BOLs.pdf
- TU-040 4-16-26 Longstring  #66640 report.pdf: https://trello.com/1/cards/69d67ce6750eefbd032db97e/attachments/69f3ceb8eee3e3a34d51f269/download/TU-040_4-16-26_Longstring__%2366640_report.pdf
- TU-040 4-16-26 Longstring  #66640 summary.pdf: https://trello.com/1/cards/69d67ce6750eefbd032db97e/attachments/69f3ced8722388dc437b8457/download/TU-040_4-16-26_Longstring__%2366640_summary.pdf
- TU-040_Longstrings_FT%2366640 (1).pdf: https://trello.com/1/cards/69d67ce6750eefbd032db97e/attachments/6a0b7340068c743fd3f526b0/download/TU-040_Longstrings_FT_2366640_(1).pdf', 'Normal', null::date, 4100, array['Waterblast Completed', 'Tubing', 'Inspection completed', 'Invoice Completed', 'Inspection summary/ Yard verification Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '69d68bb95e3681c1eb1934c0', '(TU-041/FT#66641) CP Energy (FT#2175) CAT 3 + Waterblast + Drift on 157 joints of 2 7/8 PH6', 'Trello attachments
- Material Movement and BOL TU-041.pdf: https://trello.com/1/cards/69d68bb95e3681c1eb1934c0/attachments/69f4ca6c2628acb81af06ba5/download/Material_Movement_and_BOL_TU-041.pdf
- TU-041 #66641 4.21.2026 summary.pdf: https://trello.com/1/cards/69d68bb95e3681c1eb1934c0/attachments/69fb9213e62e7d2db7102b4b/download/TU-041_%2366641_4.21.2026_summary.pdf', 'Normal', null::date, 4200, array['Tubing', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Waterblast Completed', 'Invoice Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '69d7cf87aff079be108f1d82', '(TU-042/FT#66665) CP Energy (FT#2187) Cat 3 + Waterblast + Drift on 420 joints of 2 7/8 FSS-265', 'Missing Protectors

126 pins

76 boxes

Trello attachments
- Material Movement and BOL TU-042.pdf: https://trello.com/1/cards/69d7cf87aff079be108f1d82/attachments/69f4ccd3663d25aad63749a3/download/Material_Movement_and_BOL_TU-042.pdf
- CP ENERGY TU-042 FT_2187 #66665 2.875 FFS265 SUMMARY.pdf: https://trello.com/1/cards/69d7cf87aff079be108f1d82/attachments/6a109042acce9f7fe0fc15a1/download/CP_ENERGY_TU-042_FT_2187_%2366665_2.875_FFS265_SUMMARY.pdf
- CP ENERGY TU-042 FT_2187 #66665 2.875 FFS265 REPORT.pdf: https://trello.com/1/cards/69d7cf87aff079be108f1d82/attachments/6a109042cc0c9e23060d0cbb/download/CP_ENERGY_TU-042_FT_2187_%2366665_2.875_FFS265_REPORT.pdf', 'Normal', null::date, 4300, array['Split string', 'Tubing', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed', 'Waterblast Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '69d7d0331cd30085f4523ec4', '(TU-042/FT#66665) CP Energy (FT#2187) Cat 3 + Waterblast + Drift on 450 joints of 2 3/8 FSS-247', 'Missing Protectors

94 pins

61 boxes

Trello attachments
- Material Movement and BOL TU-042.pdf: https://trello.com/1/cards/69d7d0331cd30085f4523ec4/attachments/69f4ccb50706d7eb16fa3c43/download/Material_Movement_and_BOL_TU-042.pdf
- Material Movement and BOL TU-042.pdf: https://trello.com/1/cards/69d7d0331cd30085f4523ec4/attachments/69f4ccb98fbeacd45e4d4a80/download/Material_Movement_and_BOL_TU-042.pdf
- CP WELL TESTING FT#2187 TU-042 FT#66665 5-3-26 FSS247 SUMMARY.pdf: https://trello.com/1/cards/69d7d0331cd30085f4523ec4/attachments/6a109054beb17b262ceb05dd/download/CP_WELL_TESTING_FT%232187_TU-042_FT%2366665_5-3-26_FSS247_SUMMARY.pdf
- CP WELL TESTING FT#2187 TU-042 FT#66665 5-3-26 FSS247 REPORT.pdf: https://trello.com/1/cards/69d7d0331cd30085f4523ec4/attachments/6a109054c404ece39b2aec81/download/CP_WELL_TESTING_FT%232187_TU-042_FT%2366665_5-3-26_FSS247_REPORT.pdf', 'Normal', null::date, 4400, array['Split string', 'Tubing', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed', 'Waterblast Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '69dcff100d8c0b78a94a98c7', '(TU-043/FT#66905) CP Energy(FT#2194) Cat 3 + Waterblast+ Drift on 730 joints of 2 7/8 PH6', 'Trello attachments
- Material Movement and BOL TU-043.pdf: https://trello.com/1/cards/69dcff100d8c0b78a94a98c7/attachments/69f4c0125830387d65a71b7b/download/Material_Movement_and_BOL_TU-043.pdf
- CP Energy_FT#2194 TU-043 FT#66905.pdf: https://trello.com/1/cards/69dcff100d8c0b78a94a98c7/attachments/6a0b759f3bf56fa269dfa8d4/download/CP_Energy_FT%232194_TU-043_FT%2366905.pdf
- CP ENERGY TU-043 04-24-26 FT#66905 report.pdf: https://trello.com/1/cards/69dcff100d8c0b78a94a98c7/attachments/6a0b75b9c5a2a7a89ba87f62/download/CP_ENERGY_TU-043_04-24-26_FT%2366905_report.pdf
- CP ENERGY TU-043 04-24-26 FT#66905 summary.pdf: https://trello.com/1/cards/69dcff100d8c0b78a94a98c7/attachments/6a0b767e3581b5fef735319a/download/CP_ENERGY_TU-043_04-24-26_FT%2366905_summary.pdf', 'Normal', null::date, 4500, array['Tubing', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '69e63b82ff8dd29179f439ad', '(TU-044/FT#67156) CP Energy (FT#2205) Cat 3 + Waterblast + Drift on 630 joints 2 7/8 PH6', 'Trello attachments
- TU-044 Material movement and BOL.pdf: https://trello.com/1/cards/69e63b82ff8dd29179f439ad/attachments/6a038224562889f9cbb34a67/download/TU-044_Material_movement_and_BOL.pdf
- CP ENERGY FT #2205 TU-044 4-21-26 FT#67156 revised REPORT.pdf: https://trello.com/1/cards/69e63b82ff8dd29179f439ad/attachments/6a0b76bed90cfd9d1a4d4a68/download/CP_ENERGY_FT_%232205_TU-044_4-21-26_FT%2367156_revised_REPORT.pdf
- CP ENERGY FT #2205 TU-044 4-21-26 FT#67156 revised SUMMARY.pdf: https://trello.com/1/cards/69e63b82ff8dd29179f439ad/attachments/6a0b76ce3867d0093ee60b41/download/CP_ENERGY_FT_%232205_TU-044_4-21-26_FT%2367156_revised_SUMMARY.pdf
- 67156.pdf: https://trello.com/1/cards/69e63b82ff8dd29179f439ad/attachments/6a0b76dd42c5228a01d532f4/download/67156.pdf
- CP ENERGY FT 2205 TU-044 FT#67156 pictures.pdf: https://trello.com/1/cards/69e63b82ff8dd29179f439ad/attachments/6a0b76f6a36c83449466f58d/download/CP_ENERGY_FT_2205_TU-044_FT%2367156_pictures.pdf', 'Normal', null::date, 4600, array['Tubing', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '69e7961e4ebf5395262f9e55', '(TU-045/FT#67217) CP Energy (FT#2206) Cat 3 + Waterblast + Drift on 646 joints of 2 7/8 PH6', 'Trello attachments
- TU-045 Material movement and BOL.pdf: https://trello.com/1/cards/69e7961e4ebf5395262f9e55/attachments/6a0386b410c290be4407fbcd/download/TU-045_Material_movement_and_BOL.pdf
- CP ENERGY FT#2206 TU-045 4-27-26 FT#67217 (1) SUMMARY.pdf: https://trello.com/1/cards/69e7961e4ebf5395262f9e55/attachments/6a0b793441e5f8f53e11e827/download/CP_ENERGY_FT%232206_TU-045_4-27-26_FT%2367217_(1)_SUMMARY.pdf
- CP ENERGY FT#2206 TU-045 4-27-26 FT#67217 (1) REPORT.pdf: https://trello.com/1/cards/69e7961e4ebf5395262f9e55/attachments/6a0b794059efc23fc70f0329/download/CP_ENERGY_FT%232206_TU-045_4-27-26_FT%2367217_(1)_REPORT.pdf
- 67217.pdf: https://trello.com/1/cards/69e7961e4ebf5395262f9e55/attachments/6a0b795508f6f4a4af970c87/download/67217.pdf', 'Normal', null::date, 4700, array['Tubing', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Waterblast Completed', 'Invoice Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '69efd89fca13f3b57e4d0de5', '(TU-046 / FT#67451) Turnkey /Cat 3+ Waterblast- Drift on 604 joints of 2 7/8 PH6', 'Trello attachments
- TU-046 Material Movement and BOL.pdf: https://trello.com/1/cards/69efd89fca13f3b57e4d0de5/attachments/6a03848f739fab9ee67b9ba0/download/TU-046_Material_Movement_and_BOL.pdf
- TURNKEY TU-046 FT#67451 04-29-26 report.pdf: https://trello.com/1/cards/69efd89fca13f3b57e4d0de5/attachments/6a0384afe2e3564d2a84c74d/download/TURNKEY_TU-046_FT%2367451_04-29-26_report.pdf
- TURNKEY TU-046 FT#67451 04-29-26 Summary.pdf: https://trello.com/1/cards/69efd89fca13f3b57e4d0de5/attachments/6a0384cd1f604fd4fa441fa2/download/TURNKEY_TU-046_FT%2367451_04-29-26_Summary.pdf
- Turnkey_TU-046_FT%2367451.pdf: https://trello.com/1/cards/69efd89fca13f3b57e4d0de5/attachments/6a0b79dc3bb5e5e9c16e2d49/download/Turnkey_TU-046_FT_2367451.pdf', 'Normal', null::date, 4800, array['Tubing', 'Inspection completed', 'Invoice Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '69f229f5b8302c0c48f3a207', '(TU-047/FT#67555) CP Energy (FT#2219) Cat 3 + Waterblast+ Drift on 558 joints of 2 3/8" FSS247', 'Missing Protectors

110 pins

73 boxes

Trello attachments
- CP ENERGY TU-047 FT#2219 FSS247 FT#67555 5-5-26 summary.pdf: https://trello.com/1/cards/69f229f5b8302c0c48f3a207/attachments/6a109066e411672ce1c6fcf1/download/CP_ENERGY_TU-047_FT%232219_FSS247_FT%2367555_5-5-26_summary.pdf
- CP ENERGY TU-047 FT#2219 FSS247 FT#67555 5-5-26 report.pdf: https://trello.com/1/cards/69f229f5b8302c0c48f3a207/attachments/6a109067ce03d7eca480563e/download/CP_ENERGY_TU-047_FT%232219_FSS247_FT%2367555_5-5-26_report.pdf
- TU-047 Material Movement and BOL.pdf: https://trello.com/1/cards/69f229f5b8302c0c48f3a207/attachments/6a1717e3ada005696693ba94/download/TU-047_Material_Movement_and_BOL.pdf', 'Normal', null::date, 4900, array['Tubing', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed', 'Waterblast Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6a01d00ad4998d15b18eee99', '(TU-048/FT#68113) CP Energy (FT#2233) Cat 3 + Waterblast on 246 joints of 2 7/8 PH6', 'Trello attachments
- CP ENERGY FT_2233 TU-048  68113 summary.pdf: https://trello.com/1/cards/6a01d00ad4998d15b18eee99/attachments/6a1096f6e0ef2091e66acf31/download/CP_ENERGY_FT_2233_TU-048__68113_summary.pdf
- CP ENERGY TU-048  68113 report.pdf: https://trello.com/1/cards/6a01d00ad4998d15b18eee99/attachments/6a1096f6be96fe067d43a32c/download/CP_ENERGY_TU-048__68113_report.pdf
- TU-048 Material Movement and BOL.pdf: https://trello.com/1/cards/6a01d00ad4998d15b18eee99/attachments/6a1717f0892912eb8f0a490b/download/TU-048_Material_Movement_and_BOL.pdf', 'Normal', null::date, 5000, array['Tubing', 'Inspection completed', 'Waterblast Completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6a0e2c6a53c6621e4dc169fe', '(TU-049/FT#68114) Long String / VTX/ Leopard 32H / Cat 3 + Waterblast 10 joints of 2 3/8 PH6', 'Trello attachments
- TU-049  LONG STRING 2.375 PH6  5-21-26 68114 report.pdf: https://trello.com/1/cards/6a0e2c6a53c6621e4dc169fe/attachments/6a108fc69200c27a77becafc/download/TU-049__LONG_STRING_2.375_PH6__5-21-26_68114_report.pdf
- TU-049  LONG STRING 2.375 PH6  5-21-26 68114 summary.pdf: https://trello.com/1/cards/6a0e2c6a53c6621e4dc169fe/attachments/6a108fc6b19dcd4b30ab40b9/download/TU-049__LONG_STRING_2.375_PH6__5-21-26_68114_summary.pdf
- TU-049 Material Movement and BOL.pdf: https://trello.com/1/cards/6a0e2c6a53c6621e4dc169fe/attachments/6a1717fd3cbfe7cd13f44a1a/download/TU-049_Material_Movement_and_BOL.pdf', 'Normal', null::date, 5100, array['Tubing', 'Split string', 'Waterblast Completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6a01d051f93b2dc5bb907cf2', '(TU-049/FT#68114) Long String / VTX/ Leopard 32H / Cat 3 + Waterblast on 294 joints of 2 7/8 PH6', 'Trello attachments
- TU-049  LONG STRING 2.875 PH6   68114 summary.pdf: https://trello.com/1/cards/6a01d051f93b2dc5bb907cf2/attachments/6a108fe7e71a1351bd7c3e52/download/TU-049__LONG_STRING_2.875_PH6___68114_summary.pdf
- TU-049  LONG STRING 2.875 PH6   68114 report.pdf: https://trello.com/1/cards/6a01d051f93b2dc5bb907cf2/attachments/6a108fe8e4d564423abb3b22/download/TU-049__LONG_STRING_2.875_PH6___68114_report.pdf
- TU-049 Material Movement and BOL.pdf: https://trello.com/1/cards/6a01d051f93b2dc5bb907cf2/attachments/6a1717f7f0ab2196b3eec37a/download/TU-049_Material_Movement_and_BOL.pdf', 'Normal', null::date, 5200, array['Tubing', 'Split string', 'Inspection summary/ Yard verification Completed', 'Waterblast Completed', 'Invoice Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6a02034bc7b91ed03ff3cd04', '(TU-050/FT#68144) Turnkey  CAT 3 + Rattle + Screw Gauge on 633 joints of 2 7/8 PH6', 'Trello attachments
- TU-050 Material Movement & BOL.pdf: https://trello.com/1/cards/6a02034bc7b91ed03ff3cd04/attachments/6a0b87b169011df661678387/download/TU-050_Material_Movement_%26_BOL.pdf
- TURNKEY TU-050   5-11-2026 FT#68144 SUMMARY.pdf: https://trello.com/1/cards/6a02034bc7b91ed03ff3cd04/attachments/6a109018492f60662a7aeb55/download/TURNKEY_TU-050___5-11-2026_FT%2368144_SUMMARY.pdf
- TURNKEY TU-050   5-11-2026 FT#68144 REPORT.pdf: https://trello.com/1/cards/6a02034bc7b91ed03ff3cd04/attachments/6a109019473e09a47e3a8731/download/TURNKEY_TU-050___5-11-2026_FT%2368144_REPORT.pdf', 'Normal', null::date, 5300, array['Tubing', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed', 'Waterblast Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6a023eb9bc6ff1332df9ae46', '05-20-26PB (TU-051/FT#68164) CP Energy(FT#2239) Cat 3 + waterblast + drift on 575 joints of 2 7/8" FSS-265', 'Trello attachments
- TU-051 Material Movement and BOL.pdf: https://trello.com/1/cards/6a023eb9bc6ff1332df9ae46/attachments/6a176221fc64c608645c06ae/download/TU-051_Material_Movement_and_BOL.pdf
- TU-051 Material Movement and BOL(2).pdf: https://trello.com/1/cards/6a023eb9bc6ff1332df9ae46/attachments/6a1db042033ef488aa14a936/download/TU-051_Material_Movement_and_BOL(2).pdf
- CP ENERGY FT 2239  TU-051   68164 summary.pdf: https://trello.com/1/cards/6a023eb9bc6ff1332df9ae46/attachments/6a23324110685f519d5293cb/download/CP_ENERGY_FT_2239__TU-051___68164_summary.pdf
- CP ENERGY FT 2239  TU-051   68164 report.pdf: https://trello.com/1/cards/6a023eb9bc6ff1332df9ae46/attachments/6a233242e224b0c348fa5816/download/CP_ENERGY_FT_2239__TU-051___68164_report.pdf', 'Normal', null::date, 5400, array['Tubing', 'Inspection summary/ Yard verification Completed', 'Waterblast Completed', 'Inspection completed', 'Invoice Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6a07a23b5b47900570050c29', '(TU-052/FT#68345) Turnkey  CAT 3 + Waterblast on 635 joints of 2 7/8 PH6 (added 102 joints of 2 7/8 PH6)', 'Trello attachments
- TURN KEY TU-52 #68345 SUMMARY.pdf: https://trello.com/1/cards/6a07a23b5b47900570050c29/attachments/6a1090070c97e72339dba9ff/download/TURN_KEY_TU-52_%2368345_SUMMARY.pdf
- TURN KEY TU-52 #68345 REPORT.pdf: https://trello.com/1/cards/6a07a23b5b47900570050c29/attachments/6a109008a8a067385229b868/download/TURN_KEY_TU-52_%2368345_REPORT.pdf
- TU-052 Material Movement and BOL.pdf: https://trello.com/1/cards/6a07a23b5b47900570050c29/attachments/6a17180c262a6e73070e55ff/download/TU-052_Material_Movement_and_BOL.pdf', 'Normal', null::date, 5500, array['Inspection completed', 'Inspection summary/ Yard verification Completed', 'Waterblast Completed', 'Invoice Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6a0b0b45583f47261566311d', '(TU-053/FT#68378) CP Energy (FT#2245) BPX / Blackhawk 40 / Rio State W 114H / CAT 3 + Waterblast + Drift on 325 joints of 2 7/8 PH6', 'Trello attachments
- CP ENERGY FT_2245 TU-053  FT#68378 5-18-26  SUMMARY.pdf: https://trello.com/1/cards/6a0b0b45583f47261566311d/attachments/6a10a944c21b4559319d8da5/download/CP_ENERGY_FT_2245_TU-053__FT%2368378_5-18-26__SUMMARY.pdf
- CP ENERGY FT_2245 TU-053  FT#68378 5-18-26  REPORT.pdf: https://trello.com/1/cards/6a0b0b45583f47261566311d/attachments/6a10a944f0cb5c2aa3e531ba/download/CP_ENERGY_FT_2245_TU-053__FT%2368378_5-18-26__REPORT.pdf
- TU-053 Material Movement and BOL.pdf: https://trello.com/1/cards/6a0b0b45583f47261566311d/attachments/6a1718181778bd738f924763/download/TU-053_Material_Movement_and_BOL.pdf', 'Normal', null::date, 5600, array['Inspection completed', 'Inspection summary/ Yard verification Completed', 'Waterblast Completed', 'Invoice Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6a0b16a666c2d72ed0f911f0', '(TU-054/FT#68513) CP Energy (FT#2248) CAT 3 + Waterblast + Drift on 881 joints of 2 7/8 FSS-265', 'Trello attachments
- TU-054 Material Movement and BOL.pdf: https://trello.com/1/cards/6a0b16a666c2d72ed0f911f0/attachments/6a1760225b65f5af660a8511/download/TU-054_Material_Movement_and_BOL.pdf
- CP ENERGY FT#2248 TU-054 68513 summary.pdf: https://trello.com/1/cards/6a0b16a666c2d72ed0f911f0/attachments/6a1e19ec88ee22f8ce3bdc76/download/CP_ENERGY_FT%232248_TU-054_68513_summary.pdf
- CP ENERGY FT#2248 TU-054 68513 report.pdf: https://trello.com/1/cards/6a0b16a666c2d72ed0f911f0/attachments/6a1e19eda00f322465c9051d/download/CP_ENERGY_FT%232248_TU-054_68513_report.pdf', 'Normal', null::date, 5700, array['Inspection completed', 'Waterblast Completed', 'Invoice Completed', 'Inspection summary/ Yard verification Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6a15e65aefeea1206886833c', '(TU-055/ FT#68691) CP Energy (FT#2233) Robb Stone W34B 2H / Axis 3099 / CAT 3 + Waterblast + Drift on 640 joints of 2 7/8 PH6', 'Trello attachments
- TU-055 Material Movement and BOL.pdf: https://trello.com/1/cards/6a15e65aefeea1206886833c/attachments/6a17602a5381ea7dcf81c0bb/download/TU-055_Material_Movement_and_BOL.pdf
- TU-055 CP ENERGY FT#68691 05-24-2026 summary.pdf: https://trello.com/1/cards/6a15e65aefeea1206886833c/attachments/6a1e152a6eb43528cfa408e1/download/TU-055_CP_ENERGY_FT%2368691_05-24-2026_summary.pdf
- TU-055 CP ENERGY FT#68691 05-24-2026 report.pdf: https://trello.com/1/cards/6a15e65aefeea1206886833c/attachments/6a1e152b10ea8702637955fa/download/TU-055_CP_ENERGY_FT%2368691_05-24-2026_report.pdf', 'Normal', null::date, 5800, array['Waterblast Completed', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6a15e909ef5456f347eea0a7', '05-27-26PC (TU-056/ FT#68774) Turnkey / Kaiser Francis / CAT 3 + Waterblast + Drift on 638 joints of 2 7/8 PH6 + 2 baskets', 'Trello attachments
- TU-056 Material Movement and BOL.pdf: https://trello.com/1/cards/6a15e909ef5456f347eea0a7/attachments/6a176039bc0fcc41c585b8d6/download/TU-056_Material_Movement_and_BOL.pdf
- TURNKEY TU-056  #68774  6.3.26 SUMMARY.pdf: https://trello.com/1/cards/6a15e909ef5456f347eea0a7/attachments/6a2c0a1a00a075c6854e893b/download/TURNKEY_TU-056__%2368774__6.3.26_SUMMARY.pdf
- TURNKEY TU-056  #68774  6.3.26 REPORT.pdf: https://trello.com/1/cards/6a15e909ef5456f347eea0a7/attachments/6a2c0a1bfb7ba40ae2e5d43f/download/TURNKEY_TU-056__%2368774__6.3.26_REPORT.pdf
- TURNKEY TU-056  #68774  6.3.26.xlsm: https://trello.com/1/cards/6a15e909ef5456f347eea0a7/attachments/6a2c0a2249e2181a72e80e0b/download/TURNKEY_TU-056__%2368774__6.3.26.xlsm', 'Normal', null::date, 5900, array['Waterblast Completed', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6a15e937cc72402b3cb6cece', '05-27-26PD (TU-057/FT#68773) Sagauro Pipe Rentals / CAT 3 + Waterblast + Drift on 997 joints of 2 7/8 HT6', 'Trello attachments
- TU-057 Material Movement and BOL.pdf: https://trello.com/1/cards/6a15e937cc72402b3cb6cece/attachments/6a17603f64f20f7016fa0873/download/TU-057_Material_Movement_and_BOL.pdf
- Saguaro TU-057 ft#68773  5.31.26 summary.pdf: https://trello.com/1/cards/6a15e937cc72402b3cb6cece/attachments/6a20b36ab7e7c0747dfd5b68/download/Saguaro_TU-057_ft%2368773__5.31.26_summary.pdf
- Saguaro TU-057 ft#68773  5.31.26 report.pdf: https://trello.com/1/cards/6a15e937cc72402b3cb6cece/attachments/6a20b36c850d92fff8a60ebf/download/Saguaro_TU-057_ft%2368773__5.31.26_report.pdf', 'Normal', null::date, 6000, array['Inspection completed', 'Inspection summary/ Yard verification Completed', 'Waterblast Completed', 'Invoice Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6a15e95de42c9cbad06dc7a9', '05-27-26PE (TU-058/ FT#68775) Sagauro Pipe Rentals / CAT 3 + Waterblast + Drift on 998 joints of 2 7/8 HT6', 'Trello attachments
- TU-058 Material Movement and BOL.pdf: https://trello.com/1/cards/6a15e95de42c9cbad06dc7a9/attachments/6a176045f41aba72981cfe05/download/TU-058_Material_Movement_and_BOL.pdf
- TU-058 5.28.26  SAGAURO 2.875 PH6 SUMMARY.pdf: https://trello.com/1/cards/6a15e95de42c9cbad06dc7a9/attachments/6a1e0636e5e317ea8c34acdc/download/TU-058_5.28.26__SAGAURO_2.875_PH6_SUMMARY.pdf
- TU-058 5.28.26  SAGAURO 2.875 PH6 REPORT.pdf: https://trello.com/1/cards/6a15e95de42c9cbad06dc7a9/attachments/6a1e06388693682b919df474/download/TU-058_5.28.26__SAGAURO_2.875_PH6_REPORT.pdf', 'Normal', null::date, 6100, array['Inspection completed', 'Waterblast Completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6a18caae3857538be3f7dbe2', '05-28-26PC (TU-061/FT#68883) CP Energy (FT#2253) / Adams West A23 2643 01H / CAT 3 + Waterblast + Drift on 638 joints of 2 7/8 PH6', 'Trello attachments
- TU-061 Material Movement and BOL.pdf: https://trello.com/1/cards/6a18caae3857538be3f7dbe2/attachments/6a18cab992b2479f71b7c5d1/download/TU-061_Material_Movement_and_BOL.pdf
- TU-061 CP ENERGY (2253)    FT68883  5-31-26 SUMMARY.pdf: https://trello.com/1/cards/6a18caae3857538be3f7dbe2/attachments/6a1e1c3aa9556c0f7efc3cc9/download/TU-061_CP_ENERGY_(2253)____FT68883__5-31-26_SUMMARY.pdf
- TU-061 CP ENERGY (2253)    FT68883  5-31-26 REPORT.pdf: https://trello.com/1/cards/6a18caae3857538be3f7dbe2/attachments/6a1e1c3b645a6eba51e3f58a/download/TU-061_CP_ENERGY_(2253)____FT68883__5-31-26_REPORT.pdf', 'Normal', null::date, 6200, array['Waterblast Completed', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6a206b10ec79d76db51b0825', '(TU-063/FT#69103) Oil Dog Pipe Rentals (JC4819) CAT 3 + Drift on 361 joints of 2 7/8 PH6', 'Trello attachments
- TU-063 Material Movement and BOL.pdf: https://trello.com/1/cards/6a206b10ec79d76db51b0825/attachments/6a219e84b568dc44fdd8d7e5/download/TU-063_Material_Movement_and_BOL.pdf
- TU-063 OIL FT# 69103 DOG RENTALS 6-4-2026 SUMMARY.pdf: https://trello.com/1/cards/6a206b10ec79d76db51b0825/attachments/6a23322cc5d99ec041ab15d8/download/TU-063_OIL_FT%23_69103_DOG_RENTALS_6-4-2026_SUMMARY.pdf
- TU-063 OIL FT# 69103 DOG RENTALS 6-4-2026 REPORT.pdf: https://trello.com/1/cards/6a206b10ec79d76db51b0825/attachments/6a23322dcbc9b52c900a5dcd/download/TU-063_OIL_FT%23_69103_DOG_RENTALS_6-4-2026_REPORT.pdf', 'Normal', null::date, 6300, array['Inspection completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6a20adf65d98822244bdf8f8', '(TU-064/69124) Saguaro Pipe Rentals / CAT 3 + Waterblast + Drift on 997 joints of 2 7/8 HT6', 'Trello attachments
- TU-064 Material Movement and BOL.pdf: https://trello.com/1/cards/6a20adf65d98822244bdf8f8/attachments/6a21fb103d216844b52c9357/download/TU-064_Material_Movement_and_BOL.pdf
- TU-064 FT 69124 SEGUARO 6-5-26 summary.pdf: https://trello.com/1/cards/6a20adf65d98822244bdf8f8/attachments/6a2ad5eea569c7a88694f302/download/TU-064_FT_69124_SEGUARO_6-5-26_summary.pdf
- TU-064 FT 69124 SEGUARO 6-5-26 report.pdf: https://trello.com/1/cards/6a20adf65d98822244bdf8f8/attachments/6a2ad5f0cb37e9de0752a9de/download/TU-064_FT_69124_SEGUARO_6-5-26_report.pdf', 'Normal', null::date, 6400, array['Waterblast Completed', 'Invoice Completed', 'Inspection summary/ Yard verification Completed', 'Inspection completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6a22d0c4e2ecdb73e85016a2', '(TU-065/FT#69259) Saguaro Pipe Rentals / CAT 3 + Waterblast + Drift on 1000 +/- joints of 2 7/8 HT6', 'Trello attachments
- TU-065 Material Movement and BOL.pdf: https://trello.com/1/cards/6a22d0c4e2ecdb73e85016a2/attachments/6a2c0b4dcf2de90fb926e93a/download/TU-065_Material_Movement_and_BOL.pdf
- TU-065 69259 SAGUARO 6-8-28 summary.pdf: https://trello.com/1/cards/6a22d0c4e2ecdb73e85016a2/attachments/6a2c0efb9c4d8b8a8ef5dc4e/download/TU-065_69259_SAGUARO_6-8-28_summary.pdf
- TU-065 69259 SAGUARO 6-8-28 report.pdf: https://trello.com/1/cards/6a22d0c4e2ecdb73e85016a2/attachments/6a2c0efc9fc0a53bd1389fa8/download/TU-065_69259_SAGUARO_6-8-28_report.pdf', 'Normal', null::date, 6500, array['Inspection completed', 'Waterblast Completed', 'Invoice Completed', 'Inspection summary/ Yard verification Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6a2bfcf62ec0f0c45fee4e03', '06-12-26PA (TU-066/FT#69422) Saguaro Pipe Rentals / Matador / Guss 131, 211H / CAT 3 + Waterblast + Drift on 1,025 joints of 2 7/8 HT6', 'Trello attachments
- TU-066 Material Movement and BOL.pdf: https://trello.com/1/cards/6a2bfcf62ec0f0c45fee4e03/attachments/6a2c0b5615c6073e80759283/download/TU-066_Material_Movement_and_BOL.pdf
- SAGUARO FT#69422 TU-066 6-17-26 SUMMARY.pdf: https://trello.com/1/cards/6a2bfcf62ec0f0c45fee4e03/attachments/6a459c49626e4bf8d43e9a56/download/SAGUARO_FT%2369422_TU-066_6-17-26_SUMMARY.pdf
- SAGUARO FT#69422 TU-066 6-17-26 REPORT.pdf: https://trello.com/1/cards/6a2bfcf62ec0f0c45fee4e03/attachments/6a459c490326e1ebea58d8a1/download/SAGUARO_FT%2369422_TU-066_6-17-26_REPORT.pdf', 'Normal', null::date, 6600, array['Waterblast Completed', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6a2c45c940cd710ed89387bf', '06-12-26PC (TU-067/FT#69504) Saguaro Pipe Rentals / Matador / CAT 3 + Waterblast + Drift on 950 joints of 2 7/8 HT6', 'Trello attachments
- TU-067 Material Movement and BOL.pdf: https://trello.com/1/cards/6a2c45c940cd710ed89387bf/attachments/6a3009539ef53aa4a3c1ca8d/download/TU-067_Material_Movement_and_BOL.pdf
- SAGUARO FT#69504 TU-067  6-18-26 SUMMARY.pdf: https://trello.com/1/cards/6a2c45c940cd710ed89387bf/attachments/6a459c6af8ceb97a1b8628ec/download/SAGUARO_FT%2369504_TU-067__6-18-26_SUMMARY.pdf
- SAGUARO FT#69504 TU-067  6-18-26 REPORT.pdf: https://trello.com/1/cards/6a2c45c940cd710ed89387bf/attachments/6a459c6a49f4fce771852037/download/SAGUARO_FT%2369504_TU-067__6-18-26_REPORT.pdf', 'Normal', null::date, 6700, array['Waterblast Completed', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6a2c4590f4bcf3a4f2ee8233', '(TU-068/FT#69471) Oil Dog Pipe Rentals (JC4832) / CAT 3 + Waterblast + Drift on 135 joints of 2 7/8 PH6. Clean and Visual on 231 joints of 2 7/8 PH6 TOTAL:366', 'Trello attachments
- TU-068 Material Movement and BOL.pdf: https://trello.com/1/cards/6a2c4590f4bcf3a4f2ee8233/attachments/6a300909d89c3a7a4430ef0f/download/TU-068_Material_Movement_and_BOL.pdf
- TU-068 OIL DOG RENTALS CAT.3 FT#69471 06-15-26 SUMMARY.pdf: https://trello.com/1/cards/6a2c4590f4bcf3a4f2ee8233/attachments/6a32e2e33c7a63a9073016ae/download/TU-068_OIL_DOG_RENTALS_CAT.3_FT%2369471_06-15-26_SUMMARY.pdf
- TU-068 OIL DOG RENTALS CAT.3 FT#69471 06-15-26 REPORT.pdf: https://trello.com/1/cards/6a2c4590f4bcf3a4f2ee8233/attachments/6a32e2e3472c8563f295f6c4/download/TU-068_OIL_DOG_RENTALS_CAT.3_FT%2369471_06-15-26_REPORT.pdf
- TU-068 OIL DOG RENTALS VTI FT#69471 06-15-26 REPORT.pdf: https://trello.com/1/cards/6a2c4590f4bcf3a4f2ee8233/attachments/6a32e2eeffcb6807b29d94a8/download/TU-068_OIL_DOG_RENTALS_VTI_FT%2369471_06-15-26_REPORT.pdf', 'Normal', null::date, 6800, array['Waterblast Completed', 'Split string', 'Inspection summary/ Yard verification Completed', 'Inspection completed', 'Invoice Completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a2f0f5affd6664ed4284e53', '06-15-26PA (TU-069/FT#69573) CP Energy (FT#2290) CAT 3 + Waterblast + Drift on  646 joints of 2 7/8 PH6', 'Trello attachments
- TU-069 Material Movement and BOL.pdf: https://trello.com/1/cards/6a2f0f5affd6664ed4284e53/attachments/6a30092feafb435fd4c16be7/download/TU-069_Material_Movement_and_BOL.pdf
- CP ENERGY FT#2290  T-069  69573  6.15.26 SUMMARY.pdf: https://trello.com/1/cards/6a2f0f5affd6664ed4284e53/attachments/6a34124a9a5c96b87ec09591/download/CP_ENERGY_FT%232290__T-069__69573__6.15.26_SUMMARY.pdf
- CP ENERGY FT#2290  T-069  69573  6.15.26 REPORT.pdf: https://trello.com/1/cards/6a2f0f5affd6664ed4284e53/attachments/6a34124b668cb1e8e8eeb7f1/download/CP_ENERGY_FT%232290__T-069__69573__6.15.26_REPORT.pdf', 'Normal', null::date, 600, array['Waterblast Completed', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a32fd57894255249e573518', '(TU-070/FT#69987) CP Energy (FT#2283) Key Rig 6125 / CAT 3 + Waterblast + Drift on 710 joints of 2 7/8 FSS-265', 'Trello attachments
- TU-070 Material Movement and BOL.pdf: https://trello.com/1/cards/6a32fd57894255249e573518/attachments/6a43a647f51592814b1b72fb/download/TU-070_Material_Movement_and_BOL.pdf
- CP ENERGY FT#2283  TU-070 6-22-26 SUMMARY.pdf: https://trello.com/1/cards/6a32fd57894255249e573518/attachments/6a459c05752fc29a9472bb66/download/CP_ENERGY_FT%232283__TU-070_6-22-26_SUMMARY.pdf
- CP ENERGY FT#2283  TU-070 6-22-26 REPORT.pdf: https://trello.com/1/cards/6a32fd57894255249e573518/attachments/6a459c06901ad655a6a95f31/download/CP_ENERGY_FT%232283__TU-070_6-22-26_REPORT.pdf', 'Normal', null::date, 700, array['Waterblast Completed', 'Inspection summary/ Yard verification Completed', 'Inspection completed', 'Invoice Completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a3844970fe7c90cb38026ae', '(TU-071/FT#69918) Saguaro Pipe Rentals Cat.3 + Waterblast + Drift on 350 joints of 2 3/8 HT6', 'Trello attachments
- TU-071 Material Movement and BOL.pdf: https://trello.com/1/cards/6a3844970fe7c90cb38026ae/attachments/6a43a6539f641e755a096100/download/TU-071_Material_Movement_and_BOL.pdf
- TU-071 SAGUARO 2-3-8 FT69918 6-26-26 summary.pdf: https://trello.com/1/cards/6a3844970fe7c90cb38026ae/attachments/6a4c39e77cc7b1edd279c963/download/TU-071_SAGUARO_2-3-8_FT69918_6-26-26_summary.pdf
- TU-071 SAGUARO 2-3-8 FT69918 6-26-26 report.pdf: https://trello.com/1/cards/6a3844970fe7c90cb38026ae/attachments/6a4c39e7b382016e62a977d2/download/TU-071_SAGUARO_2-3-8_FT69918_6-26-26_report.pdf', 'Normal', null::date, 800, array['Split string', 'Waterblast Completed', 'Inspection summary/ Yard verification Completed', 'Inspection completed', 'Invoice Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6a3844166b8e4f5a1159a171', '(TU-071/FT#69918) Saguaro Pipe Rentals Cat.3 + Waterblast + Drift on 640 joints of 2 7/8 HT6', 'Trello attachments
- TU-071 Material Movement and BOL.pdf: https://trello.com/1/cards/6a3844166b8e4f5a1159a171/attachments/6a43a63aecde6a4993e46f0a/download/TU-071_Material_Movement_and_BOL.pdf
- SAGUARO TU-071  2.875  FT 69918 7.1.26 summary.pdf: https://trello.com/1/cards/6a3844166b8e4f5a1159a171/attachments/6a4c39b8de6a0ec2bcac944f/download/SAGUARO_TU-071__2.875__FT_69918_7.1.26_summary.pdf
- SAGUARO TU-071  2.875  FT 69918 7.1.26 report.pdf: https://trello.com/1/cards/6a3844166b8e4f5a1159a171/attachments/6a4c39b8f3db138e4e07a56f/download/SAGUARO_TU-071__2.875__FT_69918_7.1.26_report.pdf', 'Normal', null::date, 6900, array['Split string', 'Waterblast Completed', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6a3a065b3e77f19108665ad4', '(TU-072/FT#69993) Saguaro Pipe Rentals / CAT 3 + Waterblast + Drift on 640 joints of 2 7/8 HT6', 'Trello attachments
- TU-072 Material Movement and BOL.pdf: https://trello.com/1/cards/6a3a065b3e77f19108665ad4/attachments/6a43a630fe59fd64aa067c19/download/TU-072_Material_Movement_and_BOL.pdf
- SAGAURO 2.875 HT6 TU072 FT#69993-7-2-2026 SUMMARY.pdf: https://trello.com/1/cards/6a3a065b3e77f19108665ad4/attachments/6a4c39802427334bdfc71d59/download/SAGAURO_2.875_HT6_TU072_FT%2369993-7-2-2026_SUMMARY.pdf
- SAGAURO 2.875 HT6 TU072 FT#69993-7-2-2026 REPORT.pdf: https://trello.com/1/cards/6a3a065b3e77f19108665ad4/attachments/6a4c3980604f11fbc905e4a7/download/SAGAURO_2.875_HT6_TU072_FT%2369993-7-2-2026_REPORT.pdf', 'Normal', null::date, 7000, array['Split string', 'Waterblast Completed', 'Inspection summary/ Yard verification Completed', 'Inspection completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a3a0645402573fe02e43684', '(TU-072/FT#69993) Saguaro Pipe Rentals / CAT 3 + Waterblast + Drift on 260 joints of 2 3/8 HT6', 'Trello attachments
- TU-072 Material Movement and BOL.pdf: https://trello.com/1/cards/6a3a0645402573fe02e43684/attachments/6a43a65cc4fd513def359546/download/TU-072_Material_Movement_and_BOL.pdf
- SAGUARO 2. 375 HT6 TU-072 FT 69993 6-27-26 SUMMARY.pdf: https://trello.com/1/cards/6a3a0645402573fe02e43684/attachments/6a4c3a0d98ebd638130d32d0/download/SAGUARO_2._375_HT6_TU-072_FT_69993_6-27-26_SUMMARY.pdf
- SAGUARO 2. 375 HT6 TU-072 FT 69993 6-27-26 REPORT.pdf: https://trello.com/1/cards/6a3a0645402573fe02e43684/attachments/6a4c3a0d4c865775f09d29aa/download/SAGUARO_2._375_HT6_TU-072_FT_69993_6-27-26_REPORT.pdf', 'Normal', null::date, 900, array['Split string', 'Inspection summary/ Yard verification Completed', 'Inspection completed', 'Invoice Completed', 'Waterblast Completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a3a08fdefeb6b2ac92aab8e', '(TU-073/FT#70213) CP Energy (FT#2266) CAT 3 + Waterblast + drift on 782 joints of 2 7/8 PH6', 'Trello attachments
- TU-073 Material Movement and BOL.pdf: https://trello.com/1/cards/6a3a08fdefeb6b2ac92aab8e/attachments/6a43e1faa8e605637cf8343b/download/TU-073_Material_Movement_and_BOL.pdf
- CP ENERGY FT70213 TU-073 6-28-26 summary.pdf: https://trello.com/1/cards/6a3a08fdefeb6b2ac92aab8e/attachments/6a459d52384515f12d913d1c/download/CP_ENERGY_FT70213_TU-073_6-28-26_summary.pdf
- CP ENERGY FT70213 TU-073 6-28-26 report.pdf: https://trello.com/1/cards/6a3a08fdefeb6b2ac92aab8e/attachments/6a459d5210380fa089ca9ebf/download/CP_ENERGY_FT70213_TU-073_6-28-26_report.pdf', 'Normal', null::date, 1000, array['Invoice Completed', 'Inspection summary/ Yard verification Completed', 'Inspection completed', 'Waterblast Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6a43a61a06a02b34416c880d', '(TU-074/FT#70399) Saguaro Pipe Rentals / CAT 3 + Waterblast + Drift on 900 joints of 2 7/8 HT6', 'Trello attachments
- TU-074 Material Movement and BOL.pdf: https://trello.com/1/cards/6a43a61a06a02b34416c880d/attachments/6a43a624f25a97e0ab2129c5/download/TU-074_Material_Movement_and_BOL.pdf
- SAGUARO TU74 FT#70399 7-9-2026 REPORT.pdf: https://trello.com/1/cards/6a43a61a06a02b34416c880d/attachments/6a57975d7a83d960569e55db/download/SAGUARO_TU74_FT%2370399_7-9-2026_REPORT.pdf
- SAGUARO TU74 FT#70399 7-9-2026 SUMMARY.pdf: https://trello.com/1/cards/6a43a61a06a02b34416c880d/attachments/6a57975dbe8a420fccd43409/download/SAGUARO_TU74_FT%2370399_7-9-2026_SUMMARY.pdf', 'Normal', null::date, 7100, array['Waterblast Completed', 'Inspection completed', 'Inspection summary/ Yard verification Completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a45984a125be001ee185f26', '(TU-075 /FT#70508) CP Energy (FT#2299) CAT 3 + Waterblast on 695 joints of 2 7/8 PH6', 'Trello attachments
- TU-075 Material Movement and BOL.pdf: https://trello.com/1/cards/6a45984a125be001ee185f26/attachments/6a465c7e967c895998823307/download/TU-075_Material_Movement_and_BOL.pdf
- CP ENERGY FT#2299 TU-075 70508 7.7.26 summary.pdf: https://trello.com/1/cards/6a45984a125be001ee185f26/attachments/6a57981d686c39dd4e23267d/download/CP_ENERGY_FT%232299_TU-075_70508_7.7.26_summary.pdf
- CP ENERGY FT#2299 TU-075 70508 7.7.26 report.pdf: https://trello.com/1/cards/6a45984a125be001ee185f26/attachments/6a57981dd93d5d5f673ae9fb/download/CP_ENERGY_FT%232299_TU-075_70508_7.7.26_report.pdf', 'Normal', null::date, 1100, array['Waterblast Completed', 'Inspection completed', 'Invoice Completed', 'Inspection summary/ Yard verification Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6a4598738600ffd47372defd', '(TU-076/FT#70503) Saguaro Pipe Rentals / CAT 3 + Waterblast + Drift on 900 joints of 2 7/8 HT6 ( Need to WB 165 joints)', 'Trello attachments
- TU-076 Material Movement and BOL.pdf: https://trello.com/1/cards/6a4598738600ffd47372defd/attachments/6a465c943a3a5eecce147a82/download/TU-076_Material_Movement_and_BOL.pdf
- SAGUARO TU-076 7-11-26 SUMMARY.pdf: https://trello.com/1/cards/6a4598738600ffd47372defd/attachments/6a57f1705ccf3ba134d4e672/download/SAGUARO_TU-076_7-11-26_SUMMARY.pdf
- SAGUARO TU-076 7-11-26 REPORT.pdf: https://trello.com/1/cards/6a4598738600ffd47372defd/attachments/6a57f170da4da654a671f735/download/SAGUARO_TU-076_7-11-26_REPORT.pdf', 'Normal', null::date, 7200, array['Inspection summary/ Yard verification Completed', 'Invoice Completed', 'Inspection completed', 'Waterblast Completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a4598a024ee50e53511e222', '(TU-077 / FT#70509) CP Energy (FT#2301) CAT 3 + Waterblast + Drift on 630 joints of 2 7/8 PH6', 'Trello attachments
- TU-077 Material Movement and BOL.pdf: https://trello.com/1/cards/6a4598a024ee50e53511e222/attachments/6a465c80ece15eb508fba137/download/TU-077_Material_Movement_and_BOL.pdf
- TU-077 CP ENERGY_FT2301 2.875 PH6  FT#70509  7-10-2026 SUMMARY.pdf: https://trello.com/1/cards/6a4598a024ee50e53511e222/attachments/6a553bafacea6a6baa305dce/download/TU-077_CP_ENERGY_FT2301_2.875_PH6__FT%2370509__7-10-2026_SUMMARY.pdf
- TU-077 CP ENERGY_FT2301 2.875 PH6  FT#70509  7-10-2026 REPORT.pdf: https://trello.com/1/cards/6a4598a024ee50e53511e222/attachments/6a553bb0dd692cdc9ccb0c05/download/TU-077_CP_ENERGY_FT2301_2.875_PH6__FT%2370509__7-10-2026_REPORT.pdf', 'Normal', null::date, 1200, array['Inspection completed', 'Waterblast Completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a46bf301c7e171e42f26e1a', '(TU-078/FT#70539) Saguaro Pipe Rentals / CAT 3 + Waterblast + Drift on 900 joints of 2 7/8 HT6', 'Trello attachments
- TU-078 Material Movement and BOL.pdf: https://trello.com/1/cards/6a46bf301c7e171e42f26e1a/attachments/6a4d3cc722aba9920154d330/download/TU-078_Material_Movement_and_BOL.pdf
- 7-16-26 SAGUARO TU-078 FT#70539 SUMMARY.pdf: https://trello.com/1/cards/6a46bf301c7e171e42f26e1a/attachments/6a677da9ff3e83aab48cc1cb/download/7-16-26_SAGUARO_TU-078_FT%2370539_SUMMARY.pdf
- 7-16-26 SAGUARO TU-078 FT#70539 REPORT.pdf: https://trello.com/1/cards/6a46bf301c7e171e42f26e1a/attachments/6a677daa7770bfeb66d6b96a/download/7-16-26_SAGUARO_TU-078_FT%2370539_REPORT.pdf', 'Normal', null::date, 1300, array['Waterblast Completed', 'Inspection completed', 'Invoice Completed', 'Inspection summary/ Yard verification Completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a46bf68c68623249cfe640e', '(TU-079/FT#70536) Saguaro Pipe Rentals / CAT 3 + Waterblast + Drift on 360 joints of 2 7/8 PH6', 'Trello attachments
- SAGUARO TU-79 2.875 PH6 FT#70536   7-5-26 SUMMARY.pdf: https://trello.com/1/cards/6a46bf68c68623249cfe640e/attachments/6a4c3957f081ce836642f097/download/SAGUARO_TU-79_2.875_PH6_FT%2370536___7-5-26_SUMMARY.pdf
- SAGUARO TU-79 2.875 PH6 FT#70536   7-5-26 REPORT.pdf: https://trello.com/1/cards/6a46bf68c68623249cfe640e/attachments/6a4c39575c47c4b072b4f624/download/SAGUARO_TU-79_2.875_PH6_FT%2370536___7-5-26_REPORT.pdf
- TU-079 Material Movement and BOL.pdf: https://trello.com/1/cards/6a46bf68c68623249cfe640e/attachments/6a4d3cc102d8f15bb88d550e/download/TU-079_Material_Movement_and_BOL.pdf', 'Normal', null::date, 1400, array['Invoice Completed', 'Inspection summary/ Yard verification Completed', 'Inspection completed', 'Waterblast Completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a4d3baf0ce2ed528dd084cd', '(TU-080/FT#70756) CP Energy (FT#2314) CAT 3 + Drift + Waterblast on 830 joints of 2 7/8 FSS-265', 'Trello attachments
- TU-080 Material Movement and BOL.pdf: https://trello.com/1/cards/6a4d3baf0ce2ed528dd084cd/attachments/6a4d5899316aa460aa98c6fc/download/TU-080_Material_Movement_and_BOL.pdf
- CP ENERGY FT#2314 TU-080 7-8-26 70756 SUMMARY.pdf: https://trello.com/1/cards/6a4d3baf0ce2ed528dd084cd/attachments/6a581dc897cbc7f1c21ccb9d/download/CP_ENERGY_FT%232314_TU-080_7-8-26_70756_SUMMARY.pdf
- CP ENERGY FT#2314 TU-080 7-8-26 70756 REPORT.pdf: https://trello.com/1/cards/6a4d3baf0ce2ed528dd084cd/attachments/6a581dc8430f334c100195e1/download/CP_ENERGY_FT%232314_TU-080_7-8-26_70756_REPORT.pdf', 'Normal', null::date, 1500, array['Waterblast Completed', 'Inspection completed', 'Invoice Completed', 'Inspection summary/ Yard verification Completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a4d3c27e6399bdb4ba47eb6', '(TU-081/FT#70818) CP Energy (FT#2317) CAT 3 + Waterblast + Drift on 650 joints of 2 7/8 FSS-265', 'Trello attachments
- TU-081 Material Movement and BOL.pdf: https://trello.com/1/cards/6a4d3c27e6399bdb4ba47eb6/attachments/6a5e6769ced214096b05bbb9/download/TU-081_Material_Movement_and_BOL.pdf
- CP ENERGY TU-081 FT70818 7-13-26 summary.pdf: https://trello.com/1/cards/6a4d3c27e6399bdb4ba47eb6/attachments/6a74a2f3686cd2cd20618700/download/CP_ENERGY_TU-081_FT70818_7-13-26_summary.pdf
- CP ENERGY TU-081 FT70818 7-13-26 report.pdf: https://trello.com/1/cards/6a4d3c27e6399bdb4ba47eb6/attachments/6a74a2f3a81dbf0662cf5163/download/CP_ENERGY_TU-081_FT70818_7-13-26_report.pdf
- CP ENERGY TU-081 FT70818 7-13-26 SUMMARY.pdf: https://trello.com/1/cards/6a4d3c27e6399bdb4ba47eb6/attachments/6a7f98f3d2fee5a8f6be5f03/download/CP_ENERGY_TU-081_FT70818_7-13-26_SUMMARY.pdf
- CP ENERGY TU-081 FT70818 7-13-26 REPORT.pdf: https://trello.com/1/cards/6a4d3c27e6399bdb4ba47eb6/attachments/6a7f98f343b9ef73923e37f2/download/CP_ENERGY_TU-081_FT70818_7-13-26_REPORT.pdf', 'Normal', null::date, 1600, array['Inspection completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed', 'Waterblast Completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a4e6c6ac073b92817fe7f01', '(TU-082/FT#71185) CP Energy (FT#2277) CAT 3 + Waterblast + Drift on 8 joints of tubing (4 2 7/8 FSS-265, 2 2 7/8 PH6 and 2 2 7/8 Spearhead) **on hold until 4 joints return**', 'Trello attachments
- CP ENERGY ft_2277 TU-082 MIX PIPE  7-8-26  summary.pdf: https://trello.com/1/cards/6a4e6c6ac073b92817fe7f01/attachments/6a590af88cb9d60882c0f2c1/download/CP_ENERGY_ft_2277_TU-082_MIX_PIPE__7-8-26__summary.pdf', 'Normal', null::date, 1700, array['Waterblast Completed', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a4fc2135c0bd1f41de3c6d4', '(TU-083/FT#70902) Long Strings / RDS Ranch / Michelle #1 / CAT 3 + Waterblast + Drift on 60 joints of 2 7/8 PH6', 'Trello attachments
- TU-083 Material Movement and BOL.pdf: https://trello.com/1/cards/6a4fc2135c0bd1f41de3c6d4/attachments/6a5e67bbdae482091fd6059f/download/TU-083_Material_Movement_and_BOL.pdf
- LONGSTRING FT=70902 7.20.26 TU-083 summary.pdf: https://trello.com/1/cards/6a4fc2135c0bd1f41de3c6d4/attachments/6a67e6fac522432a78fc8da0/download/LONGSTRING_FT%3D70902_7.20.26_TU-083_summary.pdf
- LONGSTRING FT=70902 7.20.26 TU-083 report.pdf: https://trello.com/1/cards/6a4fc2135c0bd1f41de3c6d4/attachments/6a67e6fad45bb5cf61622b38/download/LONGSTRING_FT%3D70902_7.20.26_TU-083_report.pdf', 'Normal', null::date, 1800, array['Waterblast Completed', 'Inspection completed', 'Invoice Completed', 'Inspection summary/ Yard verification Completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a629717477a15f97479538e', '(TU-084 / FT#71144) CP Energy (FT2312) CAT 3 + Waterblast + Drift on 223 joints of 2 3/8 FSS-247', 'Trello attachments
- TU-084 Material Movement and BOL.pdf: https://trello.com/1/cards/6a629717477a15f97479538e/attachments/6a629717477a15f9747953ca/download/TU-084_Material_Movement_and_BOL.pdf
- 7.25.26 CP ENERGY FT#2312 2.375 TU-084 71144 summary.pdf: https://trello.com/1/cards/6a629717477a15f97479538e/attachments/6a67ded6f4201f659dede4c3/download/7.25.26_CP_ENERGY_FT%232312_2.375_TU-084_71144_summary.pdf
- 7.25.26 CP ENERGY FT#2312 2.375 TU-084 71144 report.pdf: https://trello.com/1/cards/6a629717477a15f97479538e/attachments/6a67ded62c2669fcae931d06/download/7.25.26_CP_ENERGY_FT%232312_2.375_TU-084_71144_report.pdf', 'Normal', null::date, 1900, array['Waterblast Completed', 'Split string', 'Inspection completed', 'Invoice Completed', 'Inspection summary/ Yard verification Completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a57ec97c76a05608bcf0fd5', '(TU-084 / FT#71144) CP Energy (FT2312) CAT 3 + Waterblast + Drift on 710 joints of 2 7/8 FSS-265', 'Trello attachments
- TU-084 Material Movement and BOL.pdf: https://trello.com/1/cards/6a57ec97c76a05608bcf0fd5/attachments/6a5e683c64cd15da5122bb49/download/TU-084_Material_Movement_and_BOL.pdf
- 7.21.26 CP ENERGY FSS265 FT#2312 TU-084 #71144 Summary.pdf: https://trello.com/1/cards/6a57ec97c76a05608bcf0fd5/attachments/6a67def07cdf92f1917c0e39/download/7.21.26_CP_ENERGY_FSS265_FT%232312_TU-084_%2371144_Summary.pdf
- 7.21.26 CP ENERGY FSS265 FT#2312 TU-084 #71144 report.pdf: https://trello.com/1/cards/6a57ec97c76a05608bcf0fd5/attachments/6a67def01ba1d7692bc18fc2/download/7.21.26_CP_ENERGY_FSS265_FT%232312_TU-084_%2371144_report.pdf', 'Normal', null::date, 2000, array['Waterblast Completed', 'Split string', 'Inspection summary/ Yard verification Completed', 'Invoice Completed', 'Inspection completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a5e66d5dbf27c8109d0cd0e', '(TU-087 / FT#71350) Turnkey CAT 3 + Waterblast + Drift on 320 joints of 2 7/8 PH6', 'Trello attachments
- TU-087 Material Movement and BOL.pdf: https://trello.com/1/cards/6a5e66d5dbf27c8109d0cd0e/attachments/6a5e66dfe9772c9d0385cb8e/download/TU-087_Material_Movement_and_BOL.pdf
- 7-24-26 TU-087 TURNKEY FT#71350 SUB SUMMARY.pdf: https://trello.com/1/cards/6a5e66d5dbf27c8109d0cd0e/attachments/6a6e4d6e69ad98a4acfadcb2/download/7-24-26_TU-087_TURNKEY_FT%2371350_SUB_SUMMARY.pdf
- 7-24-26 TU-087 TURNKEY FT#71350 SUB REPORT .pdf: https://trello.com/1/cards/6a5e66d5dbf27c8109d0cd0e/attachments/6a6e4d6f288fe08487191dd7/download/7-24-26_TU-087_TURNKEY_FT%2371350_SUB_REPORT_.pdf
- 7-24-26 TU-087 TURNKEY FT#71350 summary.pdf: https://trello.com/1/cards/6a5e66d5dbf27c8109d0cd0e/attachments/6a74a5ae618ad9bcd2d8c402/download/7-24-26_TU-087_TURNKEY_FT%2371350_summary.pdf
- 7-24-26 TU-087 TURNKEY FT#71350 report.pdf: https://trello.com/1/cards/6a5e66d5dbf27c8109d0cd0e/attachments/6a74a5aed445ec00d6729c4e/download/7-24-26_TU-087_TURNKEY_FT%2371350_report.pdf', 'Normal', null::date, 2100, array['Waterblast Completed', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a60c6c2fb6d74ff097d782a', '(TU-088 / FT#71465) CP Energy (FT#2328) CAT 3 + Waterblast + Drift on 883 joints of 2 7/8 Spearhead', 'Trello attachments
- TU-088 Material Movement and BOL.pdf: https://trello.com/1/cards/6a60c6c2fb6d74ff097d782a/attachments/6a60c6cc27305de734bea47d/download/TU-088_Material_Movement_and_BOL.pdf
- CP ENERGY TU-88  FT#71465  7-27-2026 summary.pdf: https://trello.com/1/cards/6a60c6c2fb6d74ff097d782a/attachments/6a7e48a30b2a9eedd06a9dbc/download/CP_ENERGY_TU-88__FT%2371465__7-27-2026_summary.pdf
- CP ENERGY TU-88  FT#71465  7-27-2026 report.pdf: https://trello.com/1/cards/6a60c6c2fb6d74ff097d782a/attachments/6a7e48a4a87e36aaf412e4e7/download/CP_ENERGY_TU-88__FT%2371465__7-27-2026_report.pdf', 'Normal', null::date, 2200, array['Waterblast Completed', 'Inspection completed', 'Invoice Completed', 'Inspection summary/ Yard verification Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6a57ecb4685549c393aed84a', '(TU-085/FT#71148) Kaiser Francis CAT 3 + Waterblast + Drift on 42 joints of 2 7/8 BEN-EUI', 'Trello attachments
- TU-085 Material Movement and BOL.pdf: https://trello.com/1/cards/6a57ecb4685549c393aed84a/attachments/6a5e67969fc1067f68ea4c2d/download/TU-085_Material_Movement_and_BOL.pdf
- KAISER FRANCIS TU 085 FT71148 report.pdf: https://trello.com/1/cards/6a57ecb4685549c393aed84a/attachments/6a67e7131416ebfba6d7b5ef/download/KAISER_FRANCIS_TU_085_FT71148_report.pdf
- KAISER FRANCIS TU 085 FT71148 summary.pdf: https://trello.com/1/cards/6a57ecb4685549c393aed84a/attachments/6a67e713e966893442839501/download/KAISER_FRANCIS_TU_085_FT71148_summary.pdf', 'Normal', null::date, 7300, array['Waterblast Completed', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a650713f375aec8b39c54ca', '(TU-089/FT#71574) CP Energy (FT#2332) CAT 3 + Waterblast + Drift on 486 joints of 2 7/8 FSS-265', 'Trello attachments
- TU-089 Material Movement and BOL.pdf: https://trello.com/1/cards/6a650713f375aec8b39c54ca/attachments/6a69f56bc6aa37994e08cd04/download/TU-089_Material_Movement_and_BOL.pdf
- TU089 CP ENERGY  2332 7252026 SUMMARY.pdf: https://trello.com/1/cards/6a650713f375aec8b39c54ca/attachments/6a6e6695166431f1491e5f99/download/TU089_CP_ENERGY__2332_7252026_SUMMARY.pdf
- TU089 CP ENERGY  2332 7252026 REPORT.pdf: https://trello.com/1/cards/6a650713f375aec8b39c54ca/attachments/6a6e6695451f022bb5cff572/download/TU089_CP_ENERGY__2332_7252026_REPORT.pdf
- TU089 CP ENERGY  2332 7252026 SUMMARY.pdf: https://trello.com/1/cards/6a650713f375aec8b39c54ca/attachments/6a7fa299ee5cbee9a6b4d026/download/TU089_CP_ENERGY__2332_7252026_SUMMARY.pdf
- TU089 CP ENERGY  2332 7252026 REPORT.pdf: https://trello.com/1/cards/6a650713f375aec8b39c54ca/attachments/6a7fa299e0393462a38f9217/download/TU089_CP_ENERGY__2332_7252026_REPORT.pdf', 'Normal', null::date, 2300, array['Waterblast Completed', 'Inspection completed', 'Invoice Completed', 'Inspection summary/ Yard verification Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6a5a8cd310f9ef6f1206dafb', '(TU-086 / FT#71167) Continental Cat.3 + Waterblast + Drift on 120 joints of 2 7/8 EUE 6.5# L-80 *Will be billed to FT#71207', 'Trello attachments
- TU-086 Material Movement and BOL.pdf: https://trello.com/1/cards/6a5a8cd310f9ef6f1206dafb/attachments/6a5e681f9d6fb2cd6ffed19e/download/TU-086_Material_Movement_and_BOL.pdf
- Clearwell 152  #71167  7.18.26.xlsm: https://trello.com/1/cards/6a5a8cd310f9ef6f1206dafb/attachments/6a67e7deeebe3d89a487326e/download/Clearwell_152__%2371167__7.18.26.xlsm', 'Normal', null::date, 7400, array['Waterblast Completed', 'Inspection completed', 'Invoice Completed', 'Inspection summary/ Yard verification Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6a69f59f40b33a7b3032c987', '(TU-090/FT#71849) PMR-Kaiser Francis / CAT 3 + Waterblast + Drift on 28 joints of 2 7/8 BEN-EUI', 'Trello attachments
- TU-090 Material Movement and BOL.pdf: https://trello.com/1/cards/6a69f59f40b33a7b3032c987/attachments/6a69f5ab6070f17c771137d3/download/TU-090_Material_Movement_and_BOL.pdf
- KAISER FRANCIS TU 90 FT#71849 summary.pdf: https://trello.com/1/cards/6a69f59f40b33a7b3032c987/attachments/6a74a338e08f320fc13892bb/download/KAISER_FRANCIS_TU_90_FT%2371849_summary.pdf
- KAISER FRANCIS TU 90 FT#71849 report.pdf: https://trello.com/1/cards/6a69f59f40b33a7b3032c987/attachments/6a74a338362d3cd8d41e92de/download/KAISER_FRANCIS_TU_90_FT%2371849_report.pdf', 'Normal', null::date, 7500, array['Waterblast Completed', 'Inspection completed', 'Invoice Completed', 'Inspection summary/ Yard verification Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6a69f6bdc866f596c62854a6', '(TU-091/FT#71852) PMR-Kaiser Francis / CAT 3 + Waterblast + Drift on 8 joints of 2 7/8 BEN-EUI', 'Trello attachments
- KAISER FRANCIS TU-91 FT#71852 summary.pdf: https://trello.com/1/cards/6a69f6bdc866f596c62854a6/attachments/6a74a369c2f4ca53aa2078d9/download/KAISER_FRANCIS_TU-91_FT%2371852_summary.pdf
- KAISER FRANCIS TU-91 FT#71852 report.pdf: https://trello.com/1/cards/6a69f6bdc866f596c62854a6/attachments/6a74a369f3207846823e5ec2/download/KAISER_FRANCIS_TU-91_FT%2371852_report.pdf
- TU-091 Material Movement and BOL.pdf: https://trello.com/1/cards/6a69f6bdc866f596c62854a6/attachments/6a75e322b38172577193c744/download/TU-091_Material_Movement_and_BOL.pdf', 'Normal', null::date, 7600, array['Waterblast Completed', 'Invoice Completed', 'Inspection summary/ Yard verification Completed', 'Inspection completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6a6bcd70c91f725a60b24b47', '(TU-092/FT#71903) CP Energy VTI + End Drift on 279 joints of 2 7/8 Spearhead 7.30.26', 'Trello attachments
- TU-092 FT#71903 CP Energy Spearhead summary.pdf: https://trello.com/1/cards/6a6bcd70c91f725a60b24b47/attachments/6a74a31ed23852bcb9fb653f/download/TU-092_FT%2371903_CP_Energy_Spearhead_summary.pdf
- TU-092 FT#71903 CP Energy Spearhead report.pdf: https://trello.com/1/cards/6a6bcd70c91f725a60b24b47/attachments/6a74a31ec09a2ea992b7138f/download/TU-092_FT%2371903_CP_Energy_Spearhead_report.pdf', 'Normal', null::date, 7700, array['Inspection summary/ Yard verification Completed', 'Invoice Completed', 'Inspection completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6a836f408abc70231f253260', '(TU-105/FT#72654) CP Energy VTI on 300 joints of 2 3/8 Spearhead', 'Trello attachments
- 8.18.26 CP ENERGY TU-105 #72654 SUMMARY.pdf: https://trello.com/1/cards/6a836f408abc70231f253260/attachments/6a8c59d1d7ec435537b6344f/download/8.18.26_CP_ENERGY_TU-105_%2372654_SUMMARY.pdf
- 8.18.26 CP ENERGY TU-105 #72654 REPORT.pdf: https://trello.com/1/cards/6a836f408abc70231f253260/attachments/6a8c59d1c26a07a1907bcce2/download/8.18.26_CP_ENERGY_TU-105_%2372654_REPORT.pdf', 'Normal', null::date, 7800, array['Inspection completed', 'Invoice Completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a6c33268b677df14582beae', '(TU-093 / FT#71921) CP Energy (FT#2337) CAT 3 + Waterblast + Drift on 643 joints of 2 3/8 FSS-247', 'Trello attachments
- TU-093 Material Movement and BOL.pdf: https://trello.com/1/cards/6a6c33268b677df14582beae/attachments/6a75e3b66e2da0de8f0e5299/download/TU-093_Material_Movement_and_BOL.pdf
- TU-093 2.375 CP ENERGY 8-14-2026 FT#71921 REPORT.pdf: https://trello.com/1/cards/6a6c33268b677df14582beae/attachments/6a84f2629469094490637fb5/download/TU-093_2.375_CP_ENERGY_8-14-2026_FT%2371921_REPORT.pdf
- TU-093 2.375 CP ENERGY 8-14-2026 FT#71921 SUMMARY.pdf: https://trello.com/1/cards/6a6c33268b677df14582beae/attachments/6a84f262c66eeb5e45f9f5df/download/TU-093_2.375_CP_ENERGY_8-14-2026_FT%2371921_SUMMARY.pdf', 'Normal', null::date, 2400, array['Split string', 'Inspection completed', 'Waterblast Completed', 'Invoice Completed', 'Inspection summary/ Yard verification Completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a6c3321eba7b40a9494cc62', '(TU-093 / FT#71921) CP Energy (FT#2337) CAT 3 + Waterblast + Drift on 260 joints of 2 7/8 FSS-265', 'Trello attachments
- TU-093 Material Movement and BOL.pdf: https://trello.com/1/cards/6a6c3321eba7b40a9494cc62/attachments/6a75e3b803a35290d8035352/download/TU-093_Material_Movement_and_BOL.pdf
- T 093 2.875 CP WELL TESTING FT#71921 8-14-2026 REVISED. SUMMARY.pdf: https://trello.com/1/cards/6a6c3321eba7b40a9494cc62/attachments/6a84f248c5940947adf28a3e/download/T_093_2.875_CP_WELL_TESTING_FT%2371921_8-14-2026_REVISED._SUMMARY.pdf
- T 093 2.875 CP WELL TESTING FT#71921 8-14-2026 REVISED. REPORT.pdf: https://trello.com/1/cards/6a6c3321eba7b40a9494cc62/attachments/6a84f249a25db8f97857716c/download/T_093_2.875_CP_WELL_TESTING_FT%2371921_8-14-2026_REVISED._REPORT.pdf', 'Normal', null::date, 2500, array['Split string', 'Waterblast Completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed', 'Inspection completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a7088cf9e06f4b9bbb83158', '(TU-094/FT#71993) Saguaro Pipe Rentals / CAT 3 + Waterblast + Drift on 865 joints of 2 7/8 HT6', 'Trello attachments
- TU-094 SAGUARO 8.3.26 #71993 summary.pdf: https://trello.com/1/cards/6a7088cf9e06f4b9bbb83158/attachments/6a74ada7ee5841e304467143/download/TU-094_SAGUARO_8.3.26_%2371993_summary.pdf
- TU-094 SAGUARO 8.3.26 #71993 report.pdf: https://trello.com/1/cards/6a7088cf9e06f4b9bbb83158/attachments/6a74ada735b1904c022796f3/download/TU-094_SAGUARO_8.3.26_%2371993_report.pdf
- TU-094 Material Movement and BOL.pdf: https://trello.com/1/cards/6a7088cf9e06f4b9bbb83158/attachments/6a75e41c023cef874e56fe69/download/TU-094_Material_Movement_and_BOL.pdf', 'Normal', null::date, 2600, array['Invoice Completed', 'Inspection summary/ Yard verification Completed', 'Inspection completed', 'Waterblast Completed']::text[]),
    ('trello_6894d3816e12817e38a73bd1', '6a8ca83dbbccce760b22b200', '(TU-107/FT#72934) PMR- Kaiser Francis Cat.3 + WB + end drift on 108 joints of 2 7/8 Ben EUI and 47 subs', 'Trello attachments
- TU-107 Material Movement and BOL.pdf: https://trello.com/1/cards/6a8ca83dbbccce760b22b200/attachments/6a8dee36d93a7bed1a2ed4c0/download/TU-107_Material_Movement_and_BOL.pdf
- Kaisser Francis TU-107 #72934 REPORT.pdf: https://trello.com/1/cards/6a8ca83dbbccce760b22b200/attachments/6a909d04279699b366fd9281/download/Kaisser_Francis_TU-107_%2372934_REPORT.pdf
- Kaisser Francis TU-107 #72934 SUB SUMMARY.pdf: https://trello.com/1/cards/6a8ca83dbbccce760b22b200/attachments/6a909d04590c730673dd5f80/download/Kaisser_Francis_TU-107_%2372934_SUB_SUMMARY.pdf
- Kaisser Francis TU-107 #72934 SUMMARY.pdf: https://trello.com/1/cards/6a8ca83dbbccce760b22b200/attachments/6a909d043e73c772adabb250/download/Kaisser_Francis_TU-107_%2372934_SUMMARY.pdf
- Kaisser Francis TU-107 #72934 SUB REPORT.pdf: https://trello.com/1/cards/6a8ca83dbbccce760b22b200/attachments/6a909d0425a52e6c4e43f405/download/Kaisser_Francis_TU-107_%2372934_SUB_REPORT.pdf', 'Normal', null::date, 7900, array['Inspection completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed', 'Waterblast Completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a7089b0c92b8acc03eb07e8', '(TU-095/FT#71995) Saguaro Pipe Rentals / CAT 3 + Waterblast + Drift on 865 joints of 2 7/8 HT6', 'Trello attachments
- TU-095 Material Movement and BOL.pdf: https://trello.com/1/cards/6a7089b0c92b8acc03eb07e8/attachments/6a75e4738a041bbb58cd3c0c/download/TU-095_Material_Movement_and_BOL.pdf
- TU-095 SAGUARO #71995 8.5.26 SUMMARY.pdf: https://trello.com/1/cards/6a7089b0c92b8acc03eb07e8/attachments/6a764292b12c4ca25697f09c/download/TU-095_SAGUARO_%2371995_8.5.26_SUMMARY.pdf
- TU-095 SAGUARO #71995 8.5.26 REPORT.pdf: https://trello.com/1/cards/6a7089b0c92b8acc03eb07e8/attachments/6a764293ea419643a911ed23/download/TU-095_SAGUARO_%2371995_8.5.26_REPORT.pdf', 'Normal', null::date, 2700, array['Invoice Completed', 'Inspection summary/ Yard verification Completed', 'Waterblast Completed', 'Inspection completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a70a4b4502fd613735a9b73', '(TU-096/FT#71996) CP Energy (FT#2340) / CAT 3 + Waterblast + Drift on 670 joints of 2 7/8 Spearhead', 'Trello attachments
- TU-096 Material Movement and BOL.pdf: https://trello.com/1/cards/6a70a4b4502fd613735a9b73/attachments/6a75e4ba84f151d5fa471011/download/TU-096_Material_Movement_and_BOL.pdf
- TU-096 CP ENERGY #71996 8.6.2026 summary.pdf: https://trello.com/1/cards/6a70a4b4502fd613735a9b73/attachments/6a7e48872a1265bb81ba3705/download/TU-096_CP_ENERGY_%2371996_8.6.2026_summary.pdf
- TU-096 CP ENERGY #71996 8.6.2026 report.pdf: https://trello.com/1/cards/6a70a4b4502fd613735a9b73/attachments/6a7e4887a71b5493df131251/download/TU-096_CP_ENERGY_%2371996_8.6.2026_report.pdf', 'Normal', null::date, 2800, array['Waterblast Completed', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a70a4fb1ad443686a5008de', '(TU-097/FT#71997) CP Energy (FT#2321) / CAT 3 + Waterblast + Drift on 739 joints of 2 7/8 FSS265', 'Trello attachments
- TU-097 Material Movement and BOL.pdf: https://trello.com/1/cards/6a70a4fb1ad443686a5008de/attachments/6a75e4ef8e3a4dcc733fbf09/download/TU-097_Material_Movement_and_BOL.pdf
- 8.11.26 CP ENERGY FT2321 T-097 #71997 - Revised SUMMARY.pdf: https://trello.com/1/cards/6a70a4fb1ad443686a5008de/attachments/6a84f20b0de45e72f6bcc112/download/8.11.26_CP_ENERGY_FT2321_T-097_%2371997_-_Revised_SUMMARY.pdf
- 8.11.26 CP ENERGY FT2321 T-097 #71997 - Revised REPORT.pdf: https://trello.com/1/cards/6a70a4fb1ad443686a5008de/attachments/6a84f20c7fa82942740e1c45/download/8.11.26_CP_ENERGY_FT2321_T-097_%2371997_-_Revised_REPORT.pdf', 'Normal', null::date, 2900, array['Inspection completed', 'Waterblast Completed', 'Invoice Completed', 'Inspection summary/ Yard verification Completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a75d02c583c42a4efebc9b8', '(TU-098/FT#72223) Saguaro Pipe Rentals / CAT 3 + Waterblast + Drift on 800 joints of 2 7/8 HT6', 'Trello attachments
- SAGURAO TU-098 FT#72223 summary.pdf: https://trello.com/1/cards/6a75d02c583c42a4efebc9b8/attachments/6a7bac98a6ecba247ea74846/download/SAGURAO_TU-098_FT%2372223_summary.pdf
- SAGURAO TU-098 FT#72223 report.pdf: https://trello.com/1/cards/6a75d02c583c42a4efebc9b8/attachments/6a7bac9823bdc0a0329959e4/download/SAGURAO_TU-098_FT%2372223_report.pdf
- TU-098 Material Movement and BOL.pdf: https://trello.com/1/cards/6a75d02c583c42a4efebc9b8/attachments/6a8dc698db4e557959292f5a/download/TU-098_Material_Movement_and_BOL.pdf', 'Normal', null::date, 3000, array['Waterblast Completed', 'Inspection completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a75d05752e44fc25736c17e', '(TU-099/FT#72224) Long Strings / CAT 3 + Waterblast + Drift on 332 joints of 2 7/8 PH6', 'Trello attachments
- TU-099 Material Movement and BOL.pdf: https://trello.com/1/cards/6a75d05752e44fc25736c17e/attachments/6a75e566ebddf9371a4b19fc/download/TU-099_Material_Movement_and_BOL.pdf
- 8.8.26 LONGSTRING TU-099 #72224 SUMMARY.pdf: https://trello.com/1/cards/6a75d05752e44fc25736c17e/attachments/6a7fa2bab25c9d81ae971b78/download/8.8.26_LONGSTRING_TU-099_%2372224_SUMMARY.pdf
- 8.8.26 LONGSTRING TU-099 #72224 REPORT.pdf: https://trello.com/1/cards/6a75d05752e44fc25736c17e/attachments/6a7fa2ba7ed625b86f8fc8a2/download/8.8.26_LONGSTRING_TU-099_%2372224_REPORT.pdf', 'Normal', null::date, 3100, array['Inspection completed', 'Waterblast Completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a75d2064bb6360d05ca0f8b', '(TU-100/FT#72225) CP Energy (FT#2345) CAT 3 + Waterblast + Drift on 326 joints of 2 7/8 PH6', 'Trello attachments
- TU-100 Material Movement and BOL.pdf: https://trello.com/1/cards/6a75d2064bb6360d05ca0f8b/attachments/6a75e5bcc4b75d04f272f0d0/download/TU-100_Material_Movement_and_BOL.pdf
- CP ENGERY TU 100 FT#2345 08-18-2026 #72225 report.pdf: https://trello.com/1/cards/6a75d2064bb6360d05ca0f8b/attachments/6a8f5dcf9f9f1a3160c82723/download/CP_ENGERY_TU_100_FT%232345_08-18-2026_%2372225_report.pdf
- CP ENGERY TU 100 FT#2345 08-18-2026 #72225 summary.pdf: https://trello.com/1/cards/6a75d2064bb6360d05ca0f8b/attachments/6a8f5dcf557e3bbf591e527f/download/CP_ENGERY_TU_100_FT%232345_08-18-2026_%2372225_summary.pdf', 'Normal', null::date, 3200, array['Inspection completed', 'Waterblast Completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a75d2155d62f5c41114360e', '(TU-101/FT#72226) Turnkey / CAT 3 + Waterblast + Drift on 375 joints of 2 7/8 PH6', 'Trello attachments
- TU-101 Material Movement and BOL.pdf: https://trello.com/1/cards/6a75d2155d62f5c41114360e/attachments/6a75e695a4c988481978bdfc/download/TU-101_Material_Movement_and_BOL.pdf
- 8.12.26 TURNKEY #72226 TU-101.xlsm: https://trello.com/1/cards/6a75d2155d62f5c41114360e/attachments/6a85c93496804af1bca111d8/download/8.12.26_TURNKEY_%2372226_TU-101.xlsm
- TURNKEY TU101 FT72226  8.12.26 Summary.pdf: https://trello.com/1/cards/6a75d2155d62f5c41114360e/attachments/6a8dca4615bd0e567801e106/download/TURNKEY_TU101_FT72226__8.12.26_Summary.pdf', 'Normal', null::date, 3300, array['Inspection completed', 'Waterblast Completed', 'Invoice Completed', 'Inspection summary/ Yard verification Completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a7b612b7ae8ca39a4fbcf74', '(TU-102/FT#72350) Saguaro Pipe Rentals / CAT 3 + Waterblast + Drift on 874 joints of 2 7/8 HT6', 'Trello attachments
- TU-102 Material Movement and BOL.pdf: https://trello.com/1/cards/6a7b612b7ae8ca39a4fbcf74/attachments/6a84af969f9f76d3603a3f64/download/TU-102_Material_Movement_and_BOL.pdf
- SAGUARO TU102 FT72350 08-15-2026 summary.pdf: https://trello.com/1/cards/6a7b612b7ae8ca39a4fbcf74/attachments/6a860554db437b3aa6546a86/download/SAGUARO_TU102_FT72350_08-15-2026_summary.pdf
- SAGUARO TU102 FT72350 08-15-2026 report.pdf: https://trello.com/1/cards/6a7b612b7ae8ca39a4fbcf74/attachments/6a860554ec796b3fa39e2649/download/SAGUARO_TU102_FT72350_08-15-2026_report.pdf', 'Normal', null::date, 3400, array['Waterblast Completed', 'Inspection completed', 'Invoice Completed', 'Inspection summary/ Yard verification Completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a835d272bd2f8cd1750b3e2', '(TU-103/FT#72577) Saguaro Pipe Rentals / CAT 3 + Waterblast + Drift on 832 joints of 2 7/8 HT6', 'Missing Protectors

96-Box

126-Pin

Trello attachments
- TU-103 Material Movement and BOL.pdf: https://trello.com/1/cards/6a835d272bd2f8cd1750b3e2/attachments/6a84afab7ddc021acea81891/download/TU-103_Material_Movement_and_BOL.pdf
- SAGUARO TU-103 FT#72577 summary.pdf: https://trello.com/1/cards/6a835d272bd2f8cd1750b3e2/attachments/6a8f1aab075666aba02dd3cc/download/SAGUARO_TU-103_FT%2372577_summary.pdf
- SAGUARO TU-103 FT#72577 REPORT.pdf: https://trello.com/1/cards/6a835d272bd2f8cd1750b3e2/attachments/6a8f1aabdfc38346ef3fabd3/download/SAGUARO_TU-103_FT%2372577_REPORT.pdf', 'Normal', null::date, 3500, array['Waterblast Completed', 'Inspection completed', 'Invoice Completed', 'Inspection summary/ Yard verification Completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a84b3c39d1e5b6f1a047ee4', '(TU-106/72686) Oil Dog Pipe Rentals / CAT 3 + Drift on 73 joints of 2 7/8 PH6', 'Trello attachments
- 8.18.26 OILDOG FT#72686 report.pdf: https://trello.com/1/cards/6a84b3c39d1e5b6f1a047ee4/attachments/6a8c56c2da047c8531aa4cb9/download/8.18.26_OILDOG_FT%2372686_report.pdf
- 8.18.26 OILDOG FT#72686 summary.pdf: https://trello.com/1/cards/6a84b3c39d1e5b6f1a047ee4/attachments/6a8c56c206af0a9043d451d1/download/8.18.26_OILDOG_FT%2372686_summary.pdf
- TU-106 Material Movement and BOL.pdf: https://trello.com/1/cards/6a84b3c39d1e5b6f1a047ee4/attachments/6a8dee3ec42c04695aa002fd/download/TU-106_Material_Movement_and_BOL.pdf', 'Normal', null::date, 3600, array['Inspection summary/ Yard verification Completed', 'Invoice Completed', 'Inspection completed']::text[]),
    ('trello_69a5edde99384cffb553d786', '6a8c5c93ac70294d60b0ef13', '(TU-108/FT#72938) Long Strings VTI + end drift on 370 joints of 2 7/8 PH6', 'Trello attachments
- TU-108 Material Movement and BOL.pdf: https://trello.com/1/cards/6a8c5c93ac70294d60b0ef13/attachments/6a8dee3406e15f25f4d6d76b/download/TU-108_Material_Movement_and_BOL.pdf
- 8-25-26 LONGSTRING TU-106 FT72938 (1) summary.pdf: https://trello.com/1/cards/6a8c5c93ac70294d60b0ef13/attachments/6a905ac5f3b5bc40fcf2f5f7/download/8-25-26_LONGSTRING_TU-106_FT72938_(1)_summary.pdf
- 8-25-26 LONGSTRING TU-106 FT72938 (1) report.pdf: https://trello.com/1/cards/6a8c5c93ac70294d60b0ef13/attachments/6a905ac5c0e1f2e850cc0e54/download/8-25-26_LONGSTRING_TU-106_FT72938_(1)_report.pdf', 'Normal', null::date, 3700, array['Invoice Completed', 'Inspection summary/ Yard verification Completed', 'Inspection completed']::text[]),
    ('trello_6a3412a5ccd86392af9c1e1c', '6a1842e06b6c1f2341579b84', 'CP Energy Post Inspection (FT#68832) 84 joints of 2 7/8 FSS-265', 'Trello attachments
- CP ENERGY POST #68832 SUMMARY.pdf: https://trello.com/1/cards/6a1842e06b6c1f2341579b84/attachments/6a1e16afd90c3def45dfb5fa/download/CP_ENERGY_POST_%2368832_SUMMARY.pdf
- CP ENERGY POST #68832 REPORT.pdf: https://trello.com/1/cards/6a1842e06b6c1f2341579b84/attachments/6a1e16afdeb2187eae08de53/download/CP_ENERGY_POST_%2368832_REPORT.pdf', 'Normal', null::date, 1300, array['Inspection completed', 'Invoice Completed']::text[]),
    ('trello_6a3412a5ccd86392af9c1e1c', '6a10b247d1b12dee785850b4', 'CP Energy Post Inspection (FT#68628) 298 joints of 2 7/8 PH6', 'Trello attachments
- CP ENERGY POST FT68628 05-22-2026 summary.pdf: https://trello.com/1/cards/6a10b247d1b12dee785850b4/attachments/6a1afa4e94c4563560619a4c/download/CP_ENERGY_POST_FT68628_05-22-2026_summary.pdf
- CP ENERGY POST FT68628 05-22-2026 report 1.pdf: https://trello.com/1/cards/6a10b247d1b12dee785850b4/attachments/6a1afa4ee2b8f7dd855f61e0/download/CP_ENERGY_POST_FT68628_05-22-2026_report_1.pdf', 'Normal', null::date, 1400, array['Post Inspection', 'Tubing', 'Invoice Completed']::text[]),
    ('trello_6a3412a5ccd86392af9c1e1c', '6a032d04829a5c199807e1f4', '(FT#68179) CP Energy Post inspection on 128 joints of 2 7/8 PH6', 'Trello attachments
- CP POST 68179 summary.pdf: https://trello.com/1/cards/6a032d04829a5c199807e1f4/attachments/6a1c6e1ce932252b09b3f3a0/download/CP_POST_68179_summary.pdf
- CP POST 68179 report.pdf: https://trello.com/1/cards/6a032d04829a5c199807e1f4/attachments/6a1c6e1cb4f780193495eba2/download/CP_POST_68179_report.pdf', 'Normal', null::date, 1500, array['Tubing', 'Post Inspection', 'Invoice Completed']::text[]),
    ('trello_6a3412a5ccd86392af9c1e1c', '6a4e6ddcbe43a4f037c57303', '(FT#70821) CP Energy Post inspection on 164 joints of 2 3/8 FSS-247', 'Trello attachments
- CP POST FT#70821  7.16.26 summary.pdf: https://trello.com/1/cards/6a4e6ddcbe43a4f037c57303/attachments/6a590e6f77653a34232206d4/download/CP_POST_FT%2370821__7.16.26_summary.pdf
- CP POST FT#70821  7.16.26 report.pdf: https://trello.com/1/cards/6a4e6ddcbe43a4f037c57303/attachments/6a590e6f30f3f258d7ce434c/download/CP_POST_FT%2370821__7.16.26_report.pdf', 'Normal', null::date, 1600, array['Inspection completed', 'Inspection summary/ Yard verification Completed', 'Invoice Completed']::text[]),
    ('trello_6a3412a5ccd86392af9c1e1c', '6a79c4d52cb7957dfc069261', '(FT#72318) CP Energy Post Inspection on 466 joints of 2 7/8 PH6 and 161 joints of 2 7/8 FSS-265', 'Trello attachments
- CP Post Insp 8.15.26 summary.pdf: https://trello.com/1/cards/6a79c4d52cb7957dfc069261/attachments/6a85c8fcbdca719db8ce4bd3/download/CP_Post_Insp_8.15.26_summary.pdf
- CP Post Insp 8.15.26 report.pdf: https://trello.com/1/cards/6a79c4d52cb7957dfc069261/attachments/6a85c8fcb3af1e6964e16c10/download/CP_Post_Insp_8.15.26_report.pdf
- CP Post Insp 8.15.26 summary FSS265.pdf: https://trello.com/1/cards/6a79c4d52cb7957dfc069261/attachments/6a85c907ababd78a6b719fa4/download/CP_Post_Insp_8.15.26_summary_FSS265.pdf
- CP Post Insp 8.15.26 report FSS265.pdf: https://trello.com/1/cards/6a79c4d52cb7957dfc069261/attachments/6a85c9070026d35f80a4e5f0/download/CP_Post_Insp_8.15.26_report_FSS265.pdf', 'Normal', null::date, 1700, array['Inspection completed', 'Invoice Completed']::text[]),
    ('trello_6a3412af1c45362c4c3b9aac', '6a2dc2350f88de6ab5538083', '(FT#69548) CP Energy Pre-shipment on 677 joints of 2 7/8 PH6', '', 'Normal', null::date, 1700, array['Pre-Shipment', 'Inspection completed', 'Invoice Completed']::text[]),
    ('trello_6a3412af1c45362c4c3b9aac', '6a32fd7947f7cd67f99bbcd9', 'FT#69683 CP Energy Pre Shipment on 700 joints of 2 7/8 FSS-265', '', 'Normal', null::date, 1800, array['Inspection completed', 'Invoice Completed']::text[]),
    ('trello_6a3412af1c45362c4c3b9aac', '6a1cb5b226b94c8686663fec', '(FT#68863) CP Energy Pre-shipment on 620 joints of 2 7/8 Spearhead', '', 'Normal', null::date, 1900, array['Tubing', 'Pre-Shipment', 'Inspection completed']::text[]),
    ('trello_6a3412af1c45362c4c3b9aac', '6a3c3ad3174c8b87e635579a', '(FT#70132) Long Strings Pre Shipment on 165 joints of 2 7/8 PH6', '', 'Normal', null::date, 2000, array['Inspection completed', 'Invoice Completed']::text[]),
    ('trello_6a3412af1c45362c4c3b9aac', '6a4e6d8f68c47bd29fdef0d6', '(FT#70752) CP Energy Pre Shipment on 740 joints of 2 7/8 FSS-265', '', 'Normal', null::date, 2100, array['Inspection completed', 'Invoice Completed']::text[]),
    ('trello_6a3412af1c45362c4c3b9aac', '6a57ed5ccbf83f7f86769e54', '(FT#71143) Turnkey Pre Shipment on 320 joints of 2 7/8 PH6', '', 'Normal', null::date, 2200, array['Inspection completed', 'Invoice Completed', 'Inspection summary/ Yard verification Completed']::text[]),
    ('trello_6a3412af1c45362c4c3b9aac', '6a6797f64251713a53a8933b', '(FT#71268) 7-19-26 CP Energy Pre-shipment on 640 joints of 2 3/8 FSS247', '', 'Normal', null::date, 2300, array['Inspection completed', 'Invoice Completed']::text[]),
    ('trello_6a3412af1c45362c4c3b9aac', '6a6cb4bfaac86a944b77ff29', '(FT#71927) Turnkey Pre-Shipment/ Blow out, re-dope and cap + UT 375 joints of 2 7/8 PH6', 'Trello attachments
- TURNKEY PRESHIPMENT 7.31.26.xlsm: https://trello.com/1/cards/6a6cb4bfaac86a944b77ff29/attachments/6a6e4cc046ca95a42efc225b/download/TURNKEY_PRESHIPMENT_7.31.26.xlsm', 'Normal', null::date, 2400, array['Inspection completed', 'Invoice Completed']::text[]),
    ('trello_6a3412af1c45362c4c3b9aac', '6a6e3fdafca9baebff66f0d6', '(FT#71961) 8/1/26 Long Strings Pre-shipment on 120 joints of 2 3/8 and 200 2 7/8 Ph6', '', 'Normal', null::date, 2500, array['Inspection completed', 'Invoice Completed']::text[]),
    ('trello_6a3412af1c45362c4c3b9aac', '6a7b968f14956814bc8ef910', '(FT#72402) Long Strings Pre Shipment on 500 +/- joints of 2 7/8 PH6', '', 'Normal', null::date, 2600, array['Inspection completed', 'Invoice Completed']::text[]),
    ('trello_6a3412af1c45362c4c3b9aac', '6a8dcc604c95d0eab85cada0', '(FT#73015) Long Strings Pre Shipment on 350 joints of 2 3/8 PH6 w/ HBs', '', 'Normal', null::date, 2700, array['Inspection completed']::text[])
)
insert into public.service_board_cards (
  board_id, column_id, title, description, priority, assigned_to_name, due_date, sort_order, tags, source_type, source_id, archived_at
)
select board.id, lane.id, seed.title, nullif(seed.description, ''), seed.priority, 'Tubing', seed.due_date, seed.sort_order, seed.tags, 'trello_tubing', seed.source_id, null
from target_board board
join card_seed seed on true
join public.service_board_columns lane on lane.board_id = board.id and lane.column_key = seed.column_key
on conflict (board_id, source_type, source_id) where source_type is not null and source_id is not null do update
set column_id = excluded.column_id,
    title = excluded.title,
    description = excluded.description,
    priority = excluded.priority,
    assigned_to_name = excluded.assigned_to_name,
    due_date = excluded.due_date,
    sort_order = excluded.sort_order,
    tags = excluded.tags,
    archived_at = null;

alter table public.service_board_card_checklist add column if not exists source_type text;
alter table public.service_board_card_checklist add column if not exists source_id text;
create unique index if not exists service_board_checklist_source_unique
on public.service_board_card_checklist(card_id, source_type, source_id)
where source_type is not null and source_id is not null;

with checklist_seed (card_source_id, source_id, label, is_done, sort_order) as (
  values
    ('68bb0e511ef56cb2343df5c6', '68c9834a94d5f0ff7fce2859', '587 joints premium 2.875 FSS-265', true, 100),
    ('68bb0e511ef56cb2343df5c6', '68c98357b0457a5440714d02', '8 joints DBR 2.875 FSS-265', true, 100),
    ('68bb0e511ef56cb2343df5c6', '68c9856681ad94a6ab3990e6', '6 joints DBR 2.375 FSS-247', true, 200),
    ('68bb0e511ef56cb2343df5c6', '68c98377f27ba40f92f0a22c', '37 joints 2.875 FSS-265 transferred to DPR', true, 100),
    ('68bb0e511ef56cb2343df5c6', '68c98389844d8f2180892b16', '37 joints 2.875 FSS-265 received from DPR', true, 200),
    ('68bb0e511ef56cb2343df5c6', '68cdd7eee5b154003a0ea395', '4 joints 2.375 FSS-247 transferred to DPR', true, 300),
    ('68bb0e511ef56cb2343df5c6', '68cdd7ff57f93ade2ed2cf74', '4 joints 2.375 FSS-247 received from DPR', true, 400),
    ('68bb0e511ef56cb2343df5c6', '68c983bab44cb09727fb3405', '20 joints 2.875 FSS-265 transferred to HB', true, 100),
    ('68bb0e511ef56cb2343df5c6', '68c983c5d6eb2adbfcfc5836', '20 joints 2.875 FSS-265 received from HB', true, 200),
    ('68bb0e511ef56cb2343df5c6', '68c9878715ca16b2234cfefb', '156 joints 2.375 FSS-247 transferred to HB', true, 300),
    ('68bb0e511ef56cb2343df5c6', '68cacb0646afed4d7be46e46', '156 joints 2.375 FSS-247 received from HB', true, 400),
    ('68bb0e511ef56cb2343df5c6', '68cacb2d9ae139022364be4d', '4 joints 2.375 FSS-247 transferred to HB', true, 100),
    ('68bb0e511ef56cb2343df5c6', '68cacb3ba72bb04d35eb6420', '4 joints 2.375 FSS-247 received from HB', true, 200),
    ('69a1b603e5b9c2d91757e193', '69a1b61e00ce5165125b8f65', '407 joints', true, 100),
    ('69a1b603e5b9c2d91757e193', '69a1b62529662e81f9c51022', '26 joints', true, 100),
    ('69a1b603e5b9c2d91757e193', '69b834c8d455cec439dfa2f9', '116 joints', true, 100),
    ('69a1b603e5b9c2d91757e193', '69b834d679e24a7eae67f9eb', '82 joints', true, 100),
    ('69a1b603e5b9c2d91757e193', '69b834f99377507000686549', 'Transferred to HB 3/14', true, 200),
    ('69a1b603e5b9c2d91757e193', '69b834e4eb0f9ecf298e836a', '14 joints', true, 100),
    ('69a1b603e5b9c2d91757e193', '69b8350116fb0080a64a26fa', 'Transferred to HB 3/14', true, 200),
    ('69b83676aab6811173182866', '69bd629fe211024da0b878d1', '3 joints', true, 100),
    ('69b83676aab6811173182866', '69bd62bcfbeacf68532f3d05', '32 joints', true, 100),
    ('69d7cf87aff079be108f1d82', '6a072114808fab2a83bb5ebc', '188 joints', true, 100),
    ('69d7cf87aff079be108f1d82', '6a07215b798d351ab3b196cd', '106 joints', true, 100),
    ('69d7cf87aff079be108f1d82', '6a07216754b22fe8ed1287d6', '82 joints', true, 100),
    ('69d7cf87aff079be108f1d82', '6a072173989f6aad84ad9eb2', '39 joints', true, 100),
    ('69d7cf87aff079be108f1d82', '6a07219de959f328136c3609', '5 joints', true, 100),
    ('69e7961e4ebf5395262f9e55', '69f352cad3b6195209f125ac', '446 joints', true, 100),
    ('69e7961e4ebf5395262f9e55', '69f352dab381e9236a20618b', '76 joints', true, 100),
    ('69e7961e4ebf5395262f9e55', '69f352ebcd56dec121353ae9', '69 joints', true, 100),
    ('69e7961e4ebf5395262f9e55', '69f35304d16bab71267ef3eb', '12 joints', true, 100),
    ('69e7961e4ebf5395262f9e55', '69f35310b576a568c60dbdbf', '43 joints', true, 100),
    ('69efd89fca13f3b57e4d0de5', '69fa29979edce58e4cea39b1', '351 joints', true, 100),
    ('69efd89fca13f3b57e4d0de5', '69fa29a8e0552203ced2893d', '121 joints', true, 100),
    ('69efd89fca13f3b57e4d0de5', '69fa29b74e241bdc793a5b5a', '18 joints', true, 100),
    ('69efd89fca13f3b57e4d0de5', '69fa29c5a6c96923eed79e88', '76 joints', true, 100),
    ('69efd89fca13f3b57e4d0de5', '69fa29cf30d1e3380d074a2a', '38 joints', true, 100),
    ('6a07a23b5b47900570050c29', '6a0f3521e8cb7edf71c64eca', '311 joints', true, 100),
    ('6a07a23b5b47900570050c29', '6a0f353472657d6e36b66cd4', '47 joints', true, 100),
    ('6a07a23b5b47900570050c29', '6a2427a01e1875704380f5a8', 'Transferred to PMR', true, 200),
    ('6a07a23b5b47900570050c29', '6a0f354057695e086630f698', '12 joints', true, 100),
    ('6a07a23b5b47900570050c29', '6a0f3d89b52580659f6f1a21', 'Hardband Complete', true, 200),
    ('6a07a23b5b47900570050c29', '6a2427a6f75468f992174bd7', 'Transferred to PMR', true, 300),
    ('6a07a23b5b47900570050c29', '6a0f354cffb9150b50d0dd23', '354 joints', true, 100),
    ('6a07a23b5b47900570050c29', '6a0f3559a82b3936e87e36bf', '13 joints', true, 100),
    ('6a18caae3857538be3f7dbe2', '6a21a0873888bd6ac9e1c329', '554 joints', true, 100),
    ('6a18caae3857538be3f7dbe2', '6a21a09507dcef75ed410a07', '47 joints', true, 100),
    ('6a18caae3857538be3f7dbe2', '6a21a09e8f56aac023e559e8', 'transferred to PMR', true, 200),
    ('6a18caae3857538be3f7dbe2', '6a21a0ac4ca9954d93edd032', '17 joints', true, 100),
    ('6a18caae3857538be3f7dbe2', '6a21a0b1bc7fa42bffd7a642', 'transferred to HB', true, 200),
    ('6a18caae3857538be3f7dbe2', '6a21a0bae3caa4c90a10d4c5', '20 joints', true, 100),
    ('6a206b10ec79d76db51b0825', '6a2428579415fbb0a81d8e67', '300 joints', true, 100),
    ('6a206b10ec79d76db51b0825', '6a2428694ea3c6fa40520122', '52 joints', true, 100),
    ('6a206b10ec79d76db51b0825', '6a242871d9af4cf28ac13888', 'transferred to PMR', true, 200),
    ('6a206b10ec79d76db51b0825', '6a24287a418bc67b591e94ee', '9 joints', true, 100),
    ('6a2ada422b967d6902625959', '6a30312176f819e01ae1f93f', '140 joints', true, 100),
    ('6a2ada422b967d6902625959', '6a30312d8d8081a8b5e8fc9b', '16 joints', false, 100),
    ('6a2ada422b967d6902625959', '6a303134d800236fe3838b8b', 'transferred to DPR', false, 200),
    ('6a2ada422b967d6902625959', '6a30314084790919839cc542', '1 joint', false, 100),
    ('6a2ada422b967d6902625959', '6a3031461400b22b67e8ab30', 'transferred to HB', true, 200),
    ('6a2ada422b967d6902625959', '6a3031503022017fd3bf6a1f', '3 joints', true, 100),
    ('6a3a08fdefeb6b2ac92aab8e', '6a6a3692cb969a7c7511fd0e', '427 joints', true, 100),
    ('6a3a08fdefeb6b2ac92aab8e', '6a6a36ac47fef9d264a1a260', '241 joints', true, 100),
    ('6a3a08fdefeb6b2ac92aab8e', '6a6a36c556315de81ad85624', 'Transferred to PMR', true, 200),
    ('6a3a08fdefeb6b2ac92aab8e', '6a6a36bf8221f4194f1aa42d', '4 joints', false, 100),
    ('6a3a08fdefeb6b2ac92aab8e', '6a6a36d06b49d878fbe3ff16', 'Transferred to PMR', true, 200),
    ('6a3a08fdefeb6b2ac92aab8e', '6a6a36d9eae5a662a25b790c', 'Transferred to HB', true, 300),
    ('6a3a08fdefeb6b2ac92aab8e', '6a6a36f7fd88dff514ba9b43', '10 joints', true, 100),
    ('6a3a08fdefeb6b2ac92aab8e', '6a6a36ff37d6fe940f4ad5e8', 'Transferred to HB', true, 200),
    ('6a3a08fdefeb6b2ac92aab8e', '6a6a36f20ea2cf9017eb5613', '100 joints', true, 100),
    ('6a70a4b4502fd613735a9b73', '6a8da866c211c514c7874146', '662 joints', true, 100),
    ('6a70a4b4502fd613735a9b73', '6a8da86c4f175ab64712b120', '7 joints', false, 100),
    ('6a70a4b4502fd613735a9b73', '6a8da8737932887fb003a977', 'Transferred to PMR', true, 200),
    ('6a70a4b4502fd613735a9b73', '6a8da88419d6caccadb2ca43', '1 joint', true, 100),
    ('6894d687b100c46c20caac51', '6894d87ade032fd7820374aa', '9 HB only', true, 100),
    ('6894d687b100c46c20caac51', '689fc953c562e3b21c8b5f5a', '35 HB only', true, 200),
    ('6894d687b100c46c20caac51', '68a7974fdc9ca6ff8a6e6535', '15 HB + Reface', true, 300),
    ('6894d687b100c46c20caac51', '68a7975922587f2ca069ab6d', '1 HB + Shop', true, 400),
    ('6894d687b100c46c20caac51', '68a798ff977c46bbea8e6150', '38 joints transferred to HB', true, 500),
    ('6894d687b100c46c20caac51', '68c9842b22de27c2e1964ad2', '38 joints received from HB', true, 600),
    ('6894d687b100c46c20caac51', '6894d8c60a6dde18fd8c1992', '29 Joints sent to DPR', true, 100),
    ('6894d687b100c46c20caac51', '689f3f5f3d7d0ff8a4ac6fe1', '29 joints received from DPR', true, 200),
    ('6894d687b100c46c20caac51', '689fc972273733867073f5be', '32 joints pending shipment to DPR', true, 300),
    ('6894d687b100c46c20caac51', '68cdd60cd59a996837083043', '32 joints received from DPR', true, 400),
    ('6894d687b100c46c20caac51', '6896242f1a664d4605e819a2', '2 Joints in PIFS yard for Rattle', true, 500),
    ('6894d687b100c46c20caac51', '6894d90b49564e0a1df905eb', '3 In PIFS yard', true, 100),
    ('6894d687b100c46c20caac51', '689fc92ec81d3c4609c06ca1', '23 in PIFS yard', true, 200),
    ('6894d687b100c46c20caac51', '6894d92dd8c9cc9f93e08b45', '21 Premium', true, 100),
    ('6894d687b100c46c20caac51', '689fc944ba35841ddd610d62', '285 Premium', true, 200),
    ('6894d687b100c46c20caac51', '689fc9d34cde16e4a41d0da9', '109 reface', true, 100),
    ('6894d687b100c46c20caac51', '689fc9dd143889783ff918df', '2 HB + reface', true, 200),
    ('6894d687b100c46c20caac51', '689fc9ed9bfc4376bd0dfb71', '7 shop + reface', true, 300),
    ('696aa9a704a704150ad78ae0', '696aa9c07d8a809834feea2e', '48 joints', true, 100),
    ('696aa9a704a704150ad78ae0', '696aa9cf84fd18ef24f9f94c', '276 joints', true, 100),
    ('696aa9a704a704150ad78ae0', '696aa9ed64fa4f94679b30a6', '535 joints', true, 100),
    ('696aa9a704a704150ad78ae0', '699ef7b351f2f220c6ae9773', '246 joints', true, 100),
    ('696aa9a704a704150ad78ae0', '699ef7c5386d7aa642d16028', '85 joints', true, 100),
    ('699dc5293ea780aebab2c69b', '699dc54dc5be67d7b45192f6', '319 joints', true, 100),
    ('699dc5293ea780aebab2c69b', '699dc55fa3bad0249457b2c5', '115 joints', true, 100),
    ('699dc5293ea780aebab2c69b', '699dc56a4325b7def2e66c38', '2 joints', true, 100),
    ('69a6e102ac1c1306b051eb9e', '69a86bc5e273fb695a431ab1', '212 joints', true, 100),
    ('69a6e102ac1c1306b051eb9e', '69a86bd2f05809c86225d401', '6 joints', true, 100),
    ('69a6e102ac1c1306b051eb9e', '69a86be9bd36a749bc270cf6', '42 joints', true, 100),
    ('69a6e102ac1c1306b051eb9e', '69a86bfa8c65e86dc42b195e', '65 joints', true, 100),
    ('69a6e102ac1c1306b051eb9e', '69a86c0dd8b572cc1b159541', 'Transferred to HB 3/4/26', true, 200),
    ('69a6e102ac1c1306b051eb9e', '69a86c2c6d4f017baee9d018', '6 joints', true, 100),
    ('69a6e102ac1c1306b051eb9e', '69a86c382814fd6b5f367941', 'Transferred to HB 3/4/2026', true, 200),
    ('69a6e102ac1c1306b051eb9e', '69aa3ef9a2c4379574653b09', 'HB Complete 3/5/2026', true, 300),
    ('69c5a798133cb0fcf9015ecf', '69e2456fdb2b4842fcdf4afc', '285 joints', true, 100),
    ('69c5a798133cb0fcf9015ecf', '69e2457f92446117c80a0391', '51 joints', true, 100),
    ('69c5a798133cb0fcf9015ecf', '69e245d9cb4e6a93599bff24', 'Transferred to HB', true, 200),
    ('69c5a798133cb0fcf9015ecf', '69e2458f882556caca527159', '19 joints', true, 100),
    ('69c5a798133cb0fcf9015ecf', '69e2461b7a8347e6dd36c965', 'Transferred to HB', true, 200),
    ('69c5a798133cb0fcf9015ecf', '69e245a1dcd4e39d5f078c44', '105 joints', true, 100),
    ('69c5a798133cb0fcf9015ecf', '69e245ac9d1d2f3f0fe2aea0', '4 joints', true, 100),
    ('69caf0ad9e6fd49d1ad346f2', '69d0450d2d6d97ea8a7a1858', '155 joints', true, 100),
    ('69caf0ad9e6fd49d1ad346f2', '69d0451a3f7408f0cedd4fd9', '61 joints', true, 100),
    ('69caf0ad9e6fd49d1ad346f2', '69d0454678b2df5ee66034b8', '117 joints', true, 100),
    ('69caf0ad9e6fd49d1ad346f2', '69d0454b3fc47c05b7792c12', 'Transferred to HB', true, 200),
    ('69caf0ad9e6fd49d1ad346f2', '69d0453e0a329d75cf6cf2e2', '55 joints', true, 100),
    ('69caf0ad9e6fd49d1ad346f2', '69d0455123417ce85bc8d6ae', 'Transferred to HB', true, 200),
    ('69caf0ad9e6fd49d1ad346f2', '69d045300d65e2f34b0323ae', '12 joints', true, 100),
    ('69d68bb95e3681c1eb1934c0', '69f34c2bfda61d2b3d03a4ee', '97 joints', true, 100),
    ('69d68bb95e3681c1eb1934c0', '69f34c4f05ab18121bcbc5dc', '23 joints', true, 100),
    ('69d68bb95e3681c1eb1934c0', '69f34c86ef84841ac8235158', '2 joints', true, 100),
    ('69d68bb95e3681c1eb1934c0', '69f34c96f2196f1ac6e1a318', '30 joints', true, 100),
    ('69d68bb95e3681c1eb1934c0', '69f34cc29667dfd1155ba260', '5 joints', true, 100),
    ('69dcff100d8c0b78a94a98c7', '69f35190c836ccafc02090ae', '468 joints', true, 100),
    ('69dcff100d8c0b78a94a98c7', '69f34ee3a34130276301be05', '105 joints', false, 100),
    ('69dcff100d8c0b78a94a98c7', '69f34f010efeeffbe4b69727', '5 joints', false, 100),
    ('69dcff100d8c0b78a94a98c7', '69f34f44490a6197bd7fcaa8', '11 joints', false, 100),
    ('69dcff100d8c0b78a94a98c7', '69f34f6378e913d3207eb8a6', '19 joints', false, 100),
    ('69dcff100d8c0b78a94a98c7', '69f34f8df9482c6c597ec579', '85 joints', false, 100),
    ('69dcff100d8c0b78a94a98c7', '69f3515bd0cfa3d2d308798e', '37 joints', true, 100),
    ('69e63b82ff8dd29179f439ad', '69f352516eb3bee8f3b2d477', '495 joints', true, 100),
    ('69e63b82ff8dd29179f439ad', '69f35269acbbab592a09742e', '61 joints', false, 100),
    ('69e63b82ff8dd29179f439ad', '69f35289f97b9a9ffea3cadf', '28 joints', false, 100),
    ('69e63b82ff8dd29179f439ad', '69f3529fa80308f01f0e0386', '1 joint', false, 100),
    ('69e63b82ff8dd29179f439ad', '69f352b2331f122cf6791d45', '45 joints', true, 100),
    ('6a02034bc7b91ed03ff3cd04', '6a0b86606933c43303e47922', '188 joints', true, 100),
    ('6a02034bc7b91ed03ff3cd04', '6a0b866ffe283a1c4f2e51ee', '95 joints', true, 100),
    ('6a02034bc7b91ed03ff3cd04', '6a0b867aa3809c4f73a997da', '279 joints', true, 100),
    ('6a02034bc7b91ed03ff3cd04', '6a0b86847c48b37584098cb0', '57 joints', true, 100),
    ('6a02034bc7b91ed03ff3cd04', '6a0f3d9e868601ad66be523a', 'Hardband complete', true, 200),
    ('6a02034bc7b91ed03ff3cd04', '6a0b86a8d779c1a469b03134', '14 joints', true, 100),
    ('6a023eb9bc6ff1332df9ae46', '6a219fb768674cb5b89a5d3a', '509 joints', true, 100),
    ('6a023eb9bc6ff1332df9ae46', '6a219fcb47aea4b155036e59', '38 joints', true, 100),
    ('6a023eb9bc6ff1332df9ae46', '6a219fd3c5d405baf151c163', '1 joint', true, 100),
    ('6a023eb9bc6ff1332df9ae46', '6a219fd7e6b459021ea09321', 'transferred to HB', true, 200),
    ('6a023eb9bc6ff1332df9ae46', '6a219fe40034ea6afc6453ec', '14 joints', true, 100),
    ('6a023eb9bc6ff1332df9ae46', '6a219feac5d405baf1522384', 'transferred to HB', true, 200),
    ('6a023eb9bc6ff1332df9ae46', '6a219ff474f19e6d36ba5dc8', '13 joints', true, 100),
    ('6a0b0b45583f47261566311d', '6a0f34d17a5a0bce63711503', '277 joints', true, 100),
    ('6a0b0b45583f47261566311d', '6a0f34dfffc96b0fa033b1c6', '28 joints', true, 100),
    ('6a0b0b45583f47261566311d', '6a2427bb71c7d635d56a453d', 'Transferred to PMR', true, 200),
    ('6a0b0b45583f47261566311d', '6a0f34ee46c023949ab2d1e0', '1 joint', true, 100),
    ('6a0b0b45583f47261566311d', '6a1da82bc99e6487c006e6f0', 'Hardband Complete', true, 200),
    ('6a0b0b45583f47261566311d', '6a2427b5ec0281d833794e69', 'Transferred to PMR', true, 300),
    ('6a0b0b45583f47261566311d', '6a0f34f90e4716dac77d7c76', '16 joints', true, 100),
    ('6a0b0b45583f47261566311d', '6a0f3504eef7486cfbda9354', '3 joints', true, 100),
    ('6a20adf65d98822244bdf8f8', '6a30338bb7eb4be1454dd679', '847 joints', true, 100),
    ('6a20adf65d98822244bdf8f8', '6a30342322df8d984ce75a3b', '125 joints', true, 100),
    ('6a20adf65d98822244bdf8f8', '6a30342a993926207296919a', 'transferred to PMR', true, 200),
    ('6a20adf65d98822244bdf8f8', '6a3034342c0e89ae4976f401', '22 joints', true, 100),
    ('6a20adf65d98822244bdf8f8', '6a303439322be17641308278', 'transferred to HB', true, 200),
    ('6a20adf65d98822244bdf8f8', '6a30343d6a10fdf901a77303', '3 joints', true, 100),
    ('6a20adf65d98822244bdf8f8', '6a3034431c05728e80d65cde', 'transferred to HB', true, 200),
    ('6a20adf65d98822244bdf8f8', '6a303448b854fd9d8f816190', 'Transferred to PMR', true, 300),
    ('6a20adf65d98822244bdf8f8', '6a303451b065c9a23595c917', '3 joints', true, 100),
    ('6a22d0c4e2ecdb73e85016a2', '6a3035de7b69dea462aaa44e', '822 joints', true, 100),
    ('6a22d0c4e2ecdb73e85016a2', '6a3035eab453a8e27ce6c42e', '3 joints', true, 100),
    ('6a22d0c4e2ecdb73e85016a2', '6a3035ff4bca4690e0065c45', 'Transferred to HB', true, 200),
    ('6a22d0c4e2ecdb73e85016a2', '6a3035f404d72c7a4eca6645', '168 joints', true, 100),
    ('6a22d0c4e2ecdb73e85016a2', '6a30360753ca1cb12b85a20d', 'Transferred to PMR', true, 200),
    ('6a22d0c4e2ecdb73e85016a2', '6a3035f9925559731a8994f7', '7 joints', true, 100),
    ('6a2c0f32e5fa9bcde63192f5', '6a4d0ba818e1d632a56e9979', '496 joints', true, 100),
    ('6a2c0f32e5fa9bcde63192f5', '6a43a76daf0c04c690efb3ea', '42 joints', true, 100),
    ('6a2c0f32e5fa9bcde63192f5', '6a43a7766c548a7539c53e3a', 'transferred to DPR', true, 200),
    ('6a2c0f32e5fa9bcde63192f5', '6a4d0bbc4a23084e69fab936', '73 joints', true, 100),
    ('6a2c0f32e5fa9bcde63192f5', '6a4d0bc0982fdb83ac479e00', 'transferred to HB', true, 200),
    ('6a2c0f32e5fa9bcde63192f5', '6a43a7c7efaaba6cd14e3960', '4 joints', true, 100),
    ('6a2c0f32e5fa9bcde63192f5', '6a43a7d6ba77b636ca2e623f', 'transferred to HB', true, 200),
    ('6a2c0f32e5fa9bcde63192f5', '6a43a7dca0893beb29b84dd8', 'Transferred to DPR', false, 300),
    ('6a2c0f32e5fa9bcde63192f5', '6a4d0bc6bba66391ff76d89c', '29 joints', true, 100),
    ('6a3844166b8e4f5a1159a171', '6a6a315a53fbdaf66d9de01c', '459 joints', true, 100),
    ('6a3844166b8e4f5a1159a171', '6a6a316bf36f62b1bc8adb67', '174 joints', true, 100),
    ('6a3844166b8e4f5a1159a171', '6a6a3199d4e7fd5eefad5934', 'Transferred to PMR', true, 200),
    ('6a3844166b8e4f5a1159a171', '6a6a31863682fd52971b6aa2', '2 joints', true, 100),
    ('6a3844166b8e4f5a1159a171', '6a6a318b6dae69b3b8a3e983', 'Transferred to HB', true, 200),
    ('6a3844166b8e4f5a1159a171', '6a6a31a7756eb28871aae396', '5 joints', true, 100),
    ('6a3a0645402573fe02e43684', '6a6a33370f9af439c77fb1a5', '137 joints', true, 100),
    ('6a3a0645402573fe02e43684', '6a6a3353ed0704e3ad990158', '93 joints', true, 100),
    ('6a3a0645402573fe02e43684', '6a6a33695c2e99deac7a537b', 'Transferred to PMR', true, 200),
    ('6a3a0645402573fe02e43684', '6a6a33823f102136a15f130e', '18 joints', true, 100),
    ('6a3a0645402573fe02e43684', '6a6a33c51fcc0aacf75f544c', 'Transferred to HB', true, 200),
    ('6a3a0645402573fe02e43684', '6a6a3388fae1672202b05f00', '12 joints', false, 100),
    ('6a3a0645402573fe02e43684', '6a6a33a8c8ec0e63bee98a5a', 'Transferred to HB', true, 200),
    ('6a3a0645402573fe02e43684', '6a6a33b2752fada54a730de1', 'Transferred to PMR', true, 300),
    ('6a3a0645402573fe02e43684', '6a6a33a03e0816426bb5a3d9', '2 joints', true, 100),
    ('6a57ec97c76a05608bcf0fd5', '6a6a47438bd8bc3a381904f1', '491 joints', true, 100),
    ('6a57ec97c76a05608bcf0fd5', '6a6a474a1c086e953351acd3', '181 joints', false, 100),
    ('6a57ec97c76a05608bcf0fd5', '6a6a4750932ad0221e02bab8', 'Transferred to DPR', false, 200),
    ('6a57ec97c76a05608bcf0fd5', '6a6a4755ab840129fd799c00', '6 joints', false, 100),
    ('6a57ec97c76a05608bcf0fd5', '6a6a475abc4704405b503b7e', 'Transferred to HB', true, 200),
    ('6a57ec97c76a05608bcf0fd5', '6a6a4761f33c626428476883', 'Transferred to DPR', false, 300),
    ('6a57ec97c76a05608bcf0fd5', '6a6a476c6062261c59ae34ba', '5 joints', false, 100),
    ('6a57ec97c76a05608bcf0fd5', '6a6a47717e25c038dc7c45f1', 'Transferred to HB', true, 200),
    ('6a57ec97c76a05608bcf0fd5', '6a6a477646a75d6057b2038e', '27 joints', true, 100),
    ('6a7089b0c92b8acc03eb07e8', '6a8d9b8f926b7c95e9ca2ae5', '778 joints', false, 100),
    ('6a7089b0c92b8acc03eb07e8', '6a8d9b94831eb7da921030b0', '64 joints', false, 100),
    ('6a7089b0c92b8acc03eb07e8', '6a8d9b9ad3660db97f21afd1', 'Transferred to PMR', true, 200),
    ('6a7089b0c92b8acc03eb07e8', '6a8d9ba30b5172040cf2dea7', '43 joints', false, 100),
    ('6a7089b0c92b8acc03eb07e8', '6a8d9bab6189b46fa1522c49', 'Transferred to HB', true, 200),
    ('6a7089b0c92b8acc03eb07e8', '6a8d9bbeb398096fae916669', '2 joints', false, 100),
    ('6a7089b0c92b8acc03eb07e8', '6a8d9bc53f2f5fa16e207eb2', 'Transferred to PMR', true, 200),
    ('6a7089b0c92b8acc03eb07e8', '6a8d9bc821956c748ba8cd5d', 'Transferred to HB', false, 300),
    ('6a7089b0c92b8acc03eb07e8', '6a8d9bcff09f17f18d2c06ea', '5 joints', true, 100),
    ('6a75d05752e44fc25736c17e', '6a8dc8df7cee0f5146b2d553', '286 joints', true, 100),
    ('6a75d05752e44fc25736c17e', '6a8dc8e891a5e31d49d20e3a', '43 joints', false, 100),
    ('6a75d05752e44fc25736c17e', '6a8dc8ed58a2ca5e75ebefd8', 'Transferred to PMR', true, 200),
    ('6a75d05752e44fc25736c17e', '6a8dc8fe5e8884ef004eb442', '3 joints', true, 100),
    ('6894d78ef943dd066b7c89a7', '689b2fc3d5a4598535000d75', '474 Premium - Verified', true, 100),
    ('6894d78ef943dd066b7c89a7', '6894dc93eb467694eaf6a38b', '48 - Joints outgoing to Machine shop', true, 100),
    ('6894d78ef943dd066b7c89a7', '689b307756d128399bbf1ebd', '1 - MSR Complete + pending HB', true, 200),
    ('6894d78ef943dd066b7c89a7', '6894dccb061a9fe0463e5c9c', '48 Joints incoming from machine shop', true, 300),
    ('6894d78ef943dd066b7c89a7', '68d1400472c0b6d406d01dbb', '2 joints transferred to PMR', true, 400),
    ('6894d78ef943dd066b7c89a7', '68d14012ef1cf50c4ebf8e3a', '2 joints received from PMR', true, 500),
    ('6894d78ef943dd066b7c89a7', '6894dca70cabebe266a3892c', '12 - Joints to transfer to HB', true, 100),
    ('6894d78ef943dd066b7c89a7', '6894dcb248048d0c6539bbce', '12 - Joints incoming from HB', true, 200),
    ('6894d78ef943dd066b7c89a7', '68a7970ce28762f0ed31e54c', '1 - joint to transfer to HB', true, 300),
    ('6894d78ef943dd066b7c89a7', '68b0baa7d971ec5791f206fb', '1 - joint incoming from HB', true, 400),
    ('6894d78ef943dd066b7c89a7', '6894dcf5bd25ca3eb580c292', '33 - DBR in PIFS inventory', true, 100),
    ('68c03cc2dc39d99e35c2c098', '68c9845b12e86cea2b3576dc', '68 joints premium', true, 100),
    ('68c03cc2dc39d99e35c2c098', '68c984ab057ca958490c3511', '119 joints transferred to HB', true, 100),
    ('68c03cc2dc39d99e35c2c098', '68c984b95e439c1f7cfbce2f', '119 joints received from HB', true, 200),
    ('68c03cc2dc39d99e35c2c098', '68c984f77f0b99d5afa2b21c', '33 joints transferred to DPR', true, 100),
    ('68c03cc2dc39d99e35c2c098', '68c984ffb6a3ddf40f05e5f9', '33 joints received from DPR', true, 200),
    ('68c03cc2dc39d99e35c2c098', '68cacbc47327b4c3d06202dc', '6 joints DBR', true, 100),
    ('69039a4614730a5ca3c0d6ae', '69039a6184ac2168c6765201', '245 joints of 2.875 PH6', true, 100),
    ('69039a4614730a5ca3c0d6ae', '69039a771579ab75dfd7bd9a', '99 joints of 2.875 PH6', true, 100),
    ('69039a4614730a5ca3c0d6ae', '69039a872256f21f476ef01e', '6 joints of 2.875 DBR', true, 100),
    ('6929d5880712049805bd5cc1', '69334e0a11eda371bc693f18', '601 joints', true, 100),
    ('6929d5880712049805bd5cc1', '69334e16a7c9407d114c3406', '10 joints', true, 100),
    ('6929d5880712049805bd5cc1', '69334e31eda7b5e22d383680', '30 joints transferred (1 Shop + HB)', true, 100),
    ('6929d5880712049805bd5cc1', '69334eef1859aa82a89481d7', '30 joints received (1 Shop + HB)', true, 200),
    ('6929d5880712049805bd5cc1', '69334e44251335a0bcacd1e5', '10 joints transferred (1 Shop + HB)', true, 100),
    ('6929d5880712049805bd5cc1', '69334e6b79ab3369be035843', '10 joints received (1 Shop + HB)', true, 200),
    ('696a6b19c88739b9e752b6d3', '696a6b706523506e7309ff74', '22 DBR', true, 100),
    ('696a6b19c88739b9e752b6d3', '696a6b8d93b0b0c482a30921', '65 joints', false, 100),
    ('696a6b19c88739b9e752b6d3', '696a6ba8aff12fbf07244bed', '15 joints', false, 100),
    ('696a6b19c88739b9e752b6d3', '696a6bf1d597044a55ec247f', '3 joints', false, 100),
    ('696a6b19c88739b9e752b6d3', '696a6c091728b6061dcf2cd7', '459 joints', true, 100),
    ('699dc35cb35ae06b22b82b60', '699dc38b04f983f41db16241', '480 joints', true, 100),
    ('699dc35cb35ae06b22b82b60', '699dc39bb98bcb32dcdb2ab1', '192 joints', true, 100),
    ('699dc35cb35ae06b22b82b60', '699dc3ad8e85ab6edf71af7f', '61 joints', true, 100),
    ('699dc35cb35ae06b22b82b60', '699dc40f34b0f832662981c2', '24 joints', true, 100),
    ('699dc35cb35ae06b22b82b60', '699dc41fae6784e55e1b9e5f', '16 joints', true, 100),
    ('699ef8d50e78f403a0366c51', '699ef93cae360f3421c580ca', '512 joints of 2 7/8 FSS-265', true, 100),
    ('699ef8d50e78f403a0366c51', '699ef9aa9574a7d825801daf', '12 joints of 2 3/8 FSS-247', true, 200),
    ('699ef8d50e78f403a0366c51', '699ef9513eb7fbb69b212668', '145 joints of 2 7/8 FSS-265', true, 100),
    ('699ef8d50e78f403a0366c51', '699ef9b7b4094a241767e84f', '3 joints of 2 3/8 FSS-247', true, 200),
    ('699ef8d50e78f403a0366c51', '699ef963593dcfcc5ff64858', '62 joints of 2 7/8 FSS-265', true, 100),
    ('699ef8d50e78f403a0366c51', '699ef9ca528127bcde28635b', '112 joints of 2 3/8 FSS-265', true, 200),
    ('699ef8d50e78f403a0366c51', '699ef975bb498737466ed2ac', '15 joints of 2 7/8 FSS-265', true, 100),
    ('699ef8d50e78f403a0366c51', '699ef9dcd16bd24c40bcff53', '29 joints of 2 3/8 FSS-247', true, 200),
    ('699ef8d50e78f403a0366c51', '699ef985348d0a48110a3529', '28 joints of 2 7/8 FSS-265', true, 100),
    ('699ef8d50e78f403a0366c51', '699ef9e7f2f7ffbdf486b047', '4 joints of 2 3/8 FSS-247', true, 200),
    ('69d042eb7d3fa38284cbd837', '69e2486a840d3d1c6304af91', '354 joints', true, 100),
    ('69d042eb7d3fa38284cbd837', '69e2487a3650669545513943', '74 joints', true, 100),
    ('69d042eb7d3fa38284cbd837', '69e2488174c80da0c2a15657', 'Transferred to PMR', true, 200),
    ('69d042eb7d3fa38284cbd837', '69e2488c022a8750680cba42', '3 joints', true, 100),
    ('69f229f5b8302c0c48f3a207', '6a01cf01cbd29913a8655a9f', '275 joints', true, 100),
    ('69f229f5b8302c0c48f3a207', '6a01cf0fc7ed3fbfdc5d5f8f', '59 joints', true, 100),
    ('69f229f5b8302c0c48f3a207', '6a01cf1effcf37db2f746ba7', '42 joints', true, 100),
    ('69f229f5b8302c0c48f3a207', '6a0f3cab63d113c25d9ea530', 'HB Complete', true, 200),
    ('69f229f5b8302c0c48f3a207', '6a01cf290cd567bc915fde87', '156 joints', true, 100),
    ('69f229f5b8302c0c48f3a207', '6a01cf33123968b8ea139293', '26 joints', true, 100),
    ('6a0b16a666c2d72ed0f911f0', '6a2172a6dad9d562799e626d', '675 joints', true, 100),
    ('6a0b16a666c2d72ed0f911f0', '6a2172b3f00a5783773037e8', '82 joints', true, 100),
    ('6a0b16a666c2d72ed0f911f0', '6a2172d2ad599ea7e8bb4214', '105 joints', true, 100),
    ('6a0b16a666c2d72ed0f911f0', '6a2427dd70f8383c80b44581', 'Transferred to HB', true, 200),
    ('6a0b16a666c2d72ed0f911f0', '6a2427e03cc3f88fb684cbb5', 'HB complete', true, 300),
    ('6a0b16a666c2d72ed0f911f0', '6a2172dd16e5b06c1fabc9fe', '6 joints', true, 100),
    ('6a0b16a666c2d72ed0f911f0', '6a2427e9008ecbd1190f8a74', 'Transferred to HB', true, 200),
    ('6a0b16a666c2d72ed0f911f0', '6a2427efb73fd186bdf64327', 'HB complete', true, 300),
    ('6a0b16a666c2d72ed0f911f0', '6a2172e63900228b1ca4cea6', '13 joints', true, 100),
    ('6a0e2c6a53c6621e4dc169fe', '6a16e0eb72f510580c6ea951', '8 joints', true, 100),
    ('6a0e2c6a53c6621e4dc169fe', '6a16e0f6271fdf82d1370d77', '1 joint', true, 100),
    ('6a0e2c6a53c6621e4dc169fe', '6a16e0ffc1c2757cf4091a0d', '1 joint', true, 100),
    ('6a2bfcf62ec0f0c45fee4e03', '6a4d0d517c5c6092f9e2f700', '689 joints', true, 100),
    ('6a2bfcf62ec0f0c45fee4e03', '6a4d0d6e10958f1ee78a12dc', '179 joints', true, 100),
    ('6a2bfcf62ec0f0c45fee4e03', '6a4d0d737031291814c450b5', 'transferred to PMR', true, 200),
    ('6a2bfcf62ec0f0c45fee4e03', '6a4d0d78b79473e1a25382ca', '27 joints', true, 100),
    ('6a2bfcf62ec0f0c45fee4e03', '6a4d0d7fe703f534105fdf8c', 'Transferred to HB', true, 200),
    ('6a2bfcf62ec0f0c45fee4e03', '6a4d0d84cc7082f1b62713fc', 'Transferred to PMR', true, 300),
    ('6a2bfcf62ec0f0c45fee4e03', '6a4d0d8e3ef21935b10c002b', '129 joints', true, 100),
    ('6a2bfcf62ec0f0c45fee4e03', '6a4d0d9296cfdf036480478e', 'Transferred to HB', true, 200),
    ('6a2c45c940cd710ed89387bf', '6a4d0e32887124b3c8ebf33b', '617 joints', true, 100),
    ('6a2c45c940cd710ed89387bf', '6a4d0e3b662102008636c9b2', '82 joints', true, 100),
    ('6a2c45c940cd710ed89387bf', '6a4d0e407b8bf3c331b22df5', 'Transferred to PMR', true, 200),
    ('6a2c45c940cd710ed89387bf', '6a4d0e48a907c241e0e14fa4', '218 joints', true, 100),
    ('6a2c45c940cd710ed89387bf', '6a4d0e4fe051523a4100c615', 'Transferred to HB', true, 200),
    ('6a2c45c940cd710ed89387bf', '6a4d0e54a18b71353ca6c7d0', '32 joints', true, 100),
    ('6a2c45c940cd710ed89387bf', '6a4d0e57eef672590174be7f', 'Transferred to PMR', true, 200),
    ('6a2c45c940cd710ed89387bf', '6a4d0e5cec7a91fdf5b5acde', 'Transferred to HB', true, 300),
    ('6a2c45c940cd710ed89387bf', '6a4d0e62148329d5739e1560', '1 joint', true, 100),
    ('6a3844970fe7c90cb38026ae', '6a43a894c4673761d8025cca', '265 joints', true, 100),
    ('6a3844970fe7c90cb38026ae', '6a43a862657ac85d13361024', '51 joints', true, 100),
    ('6a3844970fe7c90cb38026ae', '6a43a86c7daeff1a90584831', 'transferred to PMR', true, 200),
    ('6a3844970fe7c90cb38026ae', '6a43a84e739b8cc095e59402', '18 joints', true, 100),
    ('6a3844970fe7c90cb38026ae', '6a43a85635bb8058054cd1b9', 'transferred to HB', true, 200),
    ('6a3844970fe7c90cb38026ae', '6a43a83e1502a5a2d992ac71', '4 joints', false, 100),
    ('6a3844970fe7c90cb38026ae', '6a43a842059362a184574684', 'transferred to HB', true, 200),
    ('6a3844970fe7c90cb38026ae', '6a43a8473ac900150f8a11b3', 'Transferred to PMR', true, 300),
    ('6a3844970fe7c90cb38026ae', '6a79c9e262076d03ae62f568', '12 joints', true, 100),
    ('6a3a065b3e77f19108665ad4', '6a6a32ac4cd6298144b02ab8', '380 joints', true, 100),
    ('6a3a065b3e77f19108665ad4', '6a6a32b82341869606a646a5', '256 joints', true, 100),
    ('6a3a065b3e77f19108665ad4', '6a6a32e18aedb8f96edbf102', 'Transferred to PMR', true, 200),
    ('6a3a065b3e77f19108665ad4', '6a6a32c46cc64a224c7fb58c', '1 joint', true, 100),
    ('6a3a065b3e77f19108665ad4', '6a6a32da00188371547da2cf', 'Transferred to HB', true, 200),
    ('6a3a065b3e77f19108665ad4', '6a6a32d135ab1905b1e8188c', '3 joints', true, 100),
    ('6a43a61a06a02b34416c880d', '6a6a381354e1b6562cb454cb', '831 joints', true, 100),
    ('6a43a61a06a02b34416c880d', '6a6a37e25fd0de01f9132276', '54 joints', true, 100),
    ('6a43a61a06a02b34416c880d', '6a6a37f8f5133edd35dff2d7', 'Transferred to PMR', true, 200),
    ('6a43a61a06a02b34416c880d', '6a6a37ccf10248469f854323', '2 joints', true, 100),
    ('6a43a61a06a02b34416c880d', '6a6a37d20aaf30d93e47ffe6', 'Transferred to PMR', true, 200),
    ('6a43a61a06a02b34416c880d', '6a6a37d6ad38648c382e1e96', 'Transferred to HB', true, 300),
    ('6a43a61a06a02b34416c880d', '6a6a37c6cb18414bec1e7e2e', '9 joints', true, 100),
    ('6a43a61a06a02b34416c880d', '6a6a37c1e3bf91de18a90839', '4 joints', true, 100),
    ('6a4598a024ee50e53511e222', '6a6a3c8fe8205debcb2a71eb', '478 joints', true, 100),
    ('6a4598a024ee50e53511e222', '6a6a3ca3b2539da0df0ef24f', '53 joints', true, 100),
    ('6a4598a024ee50e53511e222', '6a6a3ca985210b4eb6d1c54b', 'Transferred to PMR', true, 200),
    ('6a4598a024ee50e53511e222', '6a6a3cb3bb96d7398c26c891', '2 joints', false, 100),
    ('6a4598a024ee50e53511e222', '6a6a3cbb0dc3b5abe2603db9', 'Transferred to PMR', true, 200),
    ('6a4598a024ee50e53511e222', '6a6a3cc2df5fe1e710633b8d', 'Transferred to HB', true, 300),
    ('6a4598a024ee50e53511e222', '6a6a3cce3305aa2e31266879', '7 joints', true, 100),
    ('6a4598a024ee50e53511e222', '6a6a3cd21c740f5b63b25a6d', 'Transferred to HB', true, 200),
    ('6a4598a024ee50e53511e222', '6a6a3cd8b75f104fa8ad1f97', '90 joints', true, 100),
    ('6a46bf301c7e171e42f26e1a', '6a6a40e32045c9efa28e5d44', '689 joints', true, 100),
    ('6a46bf301c7e171e42f26e1a', '6a6a40e9226df662bd5dd333', '178 joints', false, 100),
    ('6a46bf301c7e171e42f26e1a', '6a6a411e58c160e786db24c2', 'Transferred to PMR', true, 200),
    ('6a46bf301c7e171e42f26e1a', '6a6a412b58b1c3df2c460e4d', '11 joints', false, 100),
    ('6a46bf301c7e171e42f26e1a', '6a6a412f64453bcd94d183af', 'Transferred to PMR', true, 200),
    ('6a46bf301c7e171e42f26e1a', '6a6a4137a9403b2145647414', 'Transferred to HB', false, 300),
    ('6a46bf301c7e171e42f26e1a', '6a6a413e992cb27a9cddf8e1', '18 joints', true, 100),
    ('6a46bf301c7e171e42f26e1a', '6a6a4144d4d50350264581f6', 'Transferred to HB', true, 200),
    ('6a46bf301c7e171e42f26e1a', '6a6a414bbc49a651161ef635', '4 joints', true, 100),
    ('6a4d3baf0ce2ed528dd084cd', '6a6a43782383a65569c8b047', '614 joints', true, 100),
    ('6a4d3baf0ce2ed528dd084cd', '6a6a43b9ee5e213ff21f4c0d', '81 joints', false, 100),
    ('6a4d3baf0ce2ed528dd084cd', '6a6a43c09797783ccb9718b8', 'Transferred to DPR', false, 200),
    ('6a4d3baf0ce2ed528dd084cd', '6a6a43aaa26e5e02c5b1eca6', '8 joints', false, 100),
    ('6a4d3baf0ce2ed528dd084cd', '6a6a43af52592c094b443c2f', 'Transferred to HB', true, 200),
    ('6a4d3baf0ce2ed528dd084cd', '6a6a43b32b7cfbf29798d458', 'Transferred to DPR', false, 300),
    ('6a4d3baf0ce2ed528dd084cd', '6a6a439e5b23e965c4ec3e43', '72 joints', false, 100),
    ('6a4d3baf0ce2ed528dd084cd', '6a6a43a5efb78f7539603f8d', 'Transferred to HB', true, 200),
    ('6a4d3baf0ce2ed528dd084cd', '6a6a439681f1f93b8110cea2', '40 joints', true, 100),
    ('6a4fc2135c0bd1f41de3c6d4', '6a6a463cb471757f58b10a24', '35 joints', true, 100),
    ('6a4fc2135c0bd1f41de3c6d4', '6a6a462f5a4f40a2d066268b', '13 joints', false, 100),
    ('6a4fc2135c0bd1f41de3c6d4', '6a6a463683554c20cbb042b7', 'Transferred to PMR', true, 200),
    ('6a4fc2135c0bd1f41de3c6d4', '6a6a4620bf7a59f19db8f06f', '1 joint', false, 100),
    ('6a4fc2135c0bd1f41de3c6d4', '6a6a4625caa48fa7431a2e62', 'Transferred to HB', true, 200),
    ('6a4fc2135c0bd1f41de3c6d4', '6a6a461905ae9e4189a970a8', '11 joints', true, 100),
    ('6a629717477a15f97479538e', '6a6a46a586b9c3a9acda5237', '71 joints', true, 100),
    ('6a629717477a15f97479538e', '6a6a46f7ff28e57f072515de', '112 joints', false, 100),
    ('6a629717477a15f97479538e', '6a6a46fcd059da3daaaad9db', 'Transferred to DPR', true, 200),
    ('6a629717477a15f97479538e', '6a6a46e2ba1029243757ce58', '9 joints', false, 100),
    ('6a629717477a15f97479538e', '6a6a46e6b70cb7a3257ce2b4', 'Transferred to HB', true, 200),
    ('6a629717477a15f97479538e', '6a6a46f16467b64f2c4c3b2b', 'Transferred to DPR', false, 300),
    ('6a629717477a15f97479538e', '6a6a46d865a5a9a783c9fb1c', '16 joints', false, 100),
    ('6a629717477a15f97479538e', '6a6a46db1cf69b13827fc203', 'Transferred to HB', true, 200),
    ('6a629717477a15f97479538e', '6a6a46cde8d19ba329480cee', '15 joints', true, 100),
    ('6a650713f375aec8b39c54ca', '6a8d96cdbd014a847bde2d88', '403 joints', true, 100),
    ('6a650713f375aec8b39c54ca', '6a8d96f00ff3ccee4144c07d', '41 joints', false, 100),
    ('6a650713f375aec8b39c54ca', '6a8d96f9200a308607c21163', 'Transferred to DPR', false, 200),
    ('6a650713f375aec8b39c54ca', '6a8d9700715d69fa90567dbd', '10 joints', false, 100),
    ('6a650713f375aec8b39c54ca', '6a8d97097a5d663c97ce8bb4', 'Transferred to HB', true, 200),
    ('6a650713f375aec8b39c54ca', '6a8d97269781756d82744447', '3 joints', false, 100),
    ('6a650713f375aec8b39c54ca', '6a8d972e4307d3259c85da90', 'Transferred to HB', true, 200),
    ('6a650713f375aec8b39c54ca', '6a8d9733dcae47ecf9183e6f', 'Transferred to DPR', false, 300),
    ('68fa64b2774d1a4fb8c66442', '68fa64efed86f85182f95520', '2 joints of FSS-265', true, 100),
    ('68fa64b2774d1a4fb8c66442', '68fa64fc8cfae981a7148f25', '11 joints of FSS-247', true, 200),
    ('68fa64b2774d1a4fb8c66442', '68fa65566fb32f687fd112b4', '42 joints of FSS-247 shipped to DPR (13 Shops, 13 Shop + RF, 8 HB + Shop + RF, 8 HB + Shop)', true, 100),
    ('68fa64b2774d1a4fb8c66442', '68fa65692821e7d159b4d958', '42 joints of FSS-247 received from DPR (13 Shops, 13 Shop + RF, 8 HB + Shop + RF, 8 HB + Shop)', true, 200),
    ('68fa64b2774d1a4fb8c66442', '68fa657ef4c35db8bcd43a6d', '69 joints of FSS-265 shipped to DPR (55 RF + Shop, 13 Shop, 1 RF + Shop + Rattle)', true, 300),
    ('68fa64b2774d1a4fb8c66442', '68fa658f45eada1a744d816d', '69 joints of FSS-265 received from DPR (55 RF + Shop, 13 Shop, 1 RF + Shop + Rattle)', true, 400),
    ('68fa64b2774d1a4fb8c66442', '68fa6602c0ba41316fc3c6a9', '1 joint sent to PMR (Bent)', true, 500),
    ('68fa64b2774d1a4fb8c66442', '68fa6628597deec8ae055bb6', '1 joint received from PMR (Bent)', true, 600),
    ('68fa64b2774d1a4fb8c66442', '68fa65bcf7ef56b4f5a133ef', '175 joints transferred to HB (105 HB + Shop, 8 HB +Shop + RF, 8 HB + Shop, 54 HB only)', true, 100),
    ('68fa64b2774d1a4fb8c66442', '68fa65c46a072744dd3a21cd', '175 joints received from HB (105 HB + Shop, 8 HB +Shop + RF, 8 HB + Shop, 54 HB only)', true, 200),
    ('68fa64b2774d1a4fb8c66442', '68fa66639aba853d1f824f10', '78 joints of FSS-247 Rig Ready', true, 100),
    ('68fa64b2774d1a4fb8c66442', '68fa667516e31c219f0d22eb', '16 joints of FSS-265 Rig Ready', true, 200),
    ('68fa64b2774d1a4fb8c66442', '68fa66ade233b5d3b7d235e6', '3 joints of FSS-265 sent to Rattle (1 RF + Rattle, 1 RF + Shop, 1 Rattle only)', true, 100),
    ('68fa64b2774d1a4fb8c66442', '68fa66b9ab2166dbe2f69d23', '3 joints of FSS-265 received from Rattle (1 RF + Rattle, 1 RF + Shop, 1 Rattle only)', true, 200),
    ('68fa64b2774d1a4fb8c66442', '68fa66cfdaed1449a45c545f', '2 joints of FSS-247 sent to Rattle (1 RF + Rattle, 1 Rattle only)', true, 300),
    ('68fa64b2774d1a4fb8c66442', '68fa66dd5396fd2f1ba0c335', '2 joints of FSS-247 received from Rattle', true, 400),
    ('68fa64b2774d1a4fb8c66442', '68fa67a1fe037dff6e816584', '368 joints of FSS-247 sent to Reface (13 Shop + RF, 8 Shop + HB + RF, 105 RF + HB, 241 RF Only)', true, 100),
    ('68fa64b2774d1a4fb8c66442', '68fa67b60007f88a1f98e0a9', '368 joints of FSS-247 received from Reface  (13 Shop + RF, 8 Shop + HB + RF, 105 RF + HB, 241 RF Only)', true, 200),
    ('68fa64b2774d1a4fb8c66442', '68fa6806fec09c8bc8b02291', '340 joints of FSS-265 sent to Reface (55 RF + Shop, 1 RF + Rattle, 1 RF + Shop, 283 RF Only)', true, 300),
    ('68fa64b2774d1a4fb8c66442', '68fa68115bad07d85a033051', '340 joints received from Reface (55 RF + Shop, 1 RF + Rattle, 1 RF + Shop, 283 RF Only)', true, 400),
    ('692607dd9ed3673f771f8b02', '6929d4d0fbb08c3aa5962b50', '260 joints', true, 100),
    ('692607dd9ed3673f771f8b02', '6929d4dee886585803520c6c', '8 joints', true, 100),
    ('692607dd9ed3673f771f8b02', '6929d4e92bf5815c1d25b995', '2 joints', true, 100),
    ('699ccb100a4fd6095c582e28', '699ccb254485e938f099c71c', '390 joints of 2 7/8 FSS-265', true, 100),
    ('699ccb100a4fd6095c582e28', '699ccd40392a613ac8aca6d1', '210 joints of 2 3/8 FSS-247', true, 200),
    ('699ccb100a4fd6095c582e28', '699ccb50bfa85c3773e62bf2', '46 joints + 10 bent of 2 7/8 FSS-265', true, 100),
    ('699ccb100a4fd6095c582e28', '699ccb539eb2be923bbedb5b', '98 joints of 2 3/8 FSS-247', true, 200),
    ('699ccb100a4fd6095c582e28', '699ccb6705a89ce039180fcb', '5 joints of 2 7/8 FSS-265', true, 100),
    ('699ccb100a4fd6095c582e28', '699ccd75acea993fe47b0dd3', '5 joints of 2 3/8 FSS-247', true, 200),
    ('699ccb100a4fd6095c582e28', '699ccb788f9e04d16ee14854', '4 joints of 2 7/8 FSS-265', true, 100),
    ('699ccb100a4fd6095c582e28', '699cd03e77f7e25215c912a5', '135 joints of 2 3/8 FSS-247', true, 200),
    ('699ccb100a4fd6095c582e28', '699cd055d7b72d04cde8d104', '62 joints of 2 3/8 FSS-247', true, 100),
    ('699dcd0e567aa503f8cc9474', '699dcd27c9c5856308ade4d4', '107 joints', true, 100),
    ('699dcd0e567aa503f8cc9474', '699dcd35b1636b8f41fb8121', '100 joints', true, 100),
    ('699dcd0e567aa503f8cc9474', '699dcd4f2224ecadc59c8653', '99 joints', true, 100),
    ('699dcd0e567aa503f8cc9474', '699dcd5fe31f9b98b5d04211', '21 joints', true, 100),
    ('699dcd0e567aa503f8cc9474', '699dcd6e0d313ea2a3f6c9ac', '11 joints', true, 100),
    ('69a1b7c943ef1a5c50352457', '69a8412314941f73b6a6718d', '707 Joints', true, 100),
    ('69a1b7c943ef1a5c50352457', '69a8413d516842bc462a4503', '31 Joints', true, 100),
    ('69a1b7c943ef1a5c50352457', '69a84179bad57c00bca9ab7a', '262 joints (33 Bent)', true, 100),
    ('69a1b7c943ef1a5c50352457', '69a84205fb9525f7022db91f', 'Transferred to PMR 3/3/26', true, 200),
    ('69a1b7c943ef1a5c50352457', '69a841b4f678d373bd18d187', '18 joints (2 bent)', true, 100),
    ('69a1b7c943ef1a5c50352457', '69a8421304bcdf781ee1fa03', 'Transferred to HB 3/3/26', true, 200),
    ('69a1b7c943ef1a5c50352457', '69a86cb83a3774fc5fdc18da', 'Transferred to PMR from HB 3/4/2026', true, 300),
    ('69a1b7c943ef1a5c50352457', '69a841d608341f50205c166d', '82 joints', true, 100),
    ('69a1b7c943ef1a5c50352457', '69a842331b4c7fb3f3e7b4e9', 'Transferred to HB 3/3/26', true, 200),
    ('69a7a038409f4f6eb9a5e0de', '69b43e473717a03a0d8797e1', '459 joints', true, 100),
    ('69a7a038409f4f6eb9a5e0de', '69b43e547c8872758f0b8471', '181 joints', true, 100),
    ('69a7a038409f4f6eb9a5e0de', '69b43e62f4ff10d109482868', '108 joints', true, 100),
    ('69a7a038409f4f6eb9a5e0de', '69b43e78483849a2973ef9df', '51 joints', true, 100),
    ('69a7a038409f4f6eb9a5e0de', '69b43e8398f62bfd7d44c252', '29 joints', true, 100),
    ('69d50c64fb08ec71579ae99f', '69e247e0968bb763e4302ae6', '330 joints', true, 100),
    ('69d50c64fb08ec71579ae99f', '69e247eddda066837b1a8605', '130 joints', true, 100),
    ('69d50c64fb08ec71579ae99f', '69e247f323db002e207e8a0f', 'Transferred to HB', true, 200),
    ('69d50c64fb08ec71579ae99f', '69e24805bdc715addb9558f0', '38 joints', true, 100),
    ('69d50c64fb08ec71579ae99f', '69e2480ddc7df6da47a822b3', 'Transferred to HB', true, 200),
    ('69d50c64fb08ec71579ae99f', '69e2481b51a2e0e48c1f8926', '115 joints', true, 100),
    ('69d50c64fb08ec71579ae99f', '69e2482114915d03b2b0e884', 'Transferred to PMR', true, 200),
    ('69d50c64fb08ec71579ae99f', '69e2482ee22ee87c706ba30f', '22 joints', true, 100),
    ('69d7d0331cd30085f4523ec4', '69fa28fb0027c850ef04a13b', '134 joints', true, 100),
    ('69d7d0331cd30085f4523ec4', '69fa290a4cdaa77fb98780c6', '68 joints', true, 100),
    ('69d7d0331cd30085f4523ec4', '69fa29176583172b8d07c316', '158 joints', true, 100),
    ('69d7d0331cd30085f4523ec4', '69fa2926dff11ad9fbb470f3', '71 joints', true, 100),
    ('69d7d0331cd30085f4523ec4', '69fa2931ea8b65f4972c4e46', '19 joints', true, 100),
    ('6a15ea30bb175024ff9c8daa', '6a273f03fff928d4e00bb1f5', '256 joints', true, 100),
    ('6a15ea30bb175024ff9c8daa', '6a273f0fe9207ac51ac16402', '54 joints', false, 100),
    ('6a15ea30bb175024ff9c8daa', '6a273f1741a51151e8bb6031', 'Transferred to PMR', true, 200),
    ('6a15ea30bb175024ff9c8daa', '6a273f280cd50655707a8392', '1 joint', false, 100),
    ('6a15ea30bb175024ff9c8daa', '6a273f341be5292785e8541f', 'transferred to PMR', true, 200),
    ('6a15ea30bb175024ff9c8daa', '6a273f4468807b757ca50221', '16 joints', true, 100),
    ('6a15ea30bb175024ff9c8daa', '6a273f49bfe28e816cfb7095', 'transferred to HB', true, 200),
    ('6a15ea30bb175024ff9c8daa', '6a273f540027ba0828e2543d', '26 joints', true, 100),
    ('6a4d3c27e6399bdb4ba47eb6', '6a8d93dba6bd5708909ff6be', '303 joints', true, 100),
    ('6a4d3c27e6399bdb4ba47eb6', '6a8d93ef0f6943a28043422d', '31 joints', false, 100),
    ('6a4d3c27e6399bdb4ba47eb6', '6a8d94016544e689d413fc8c', 'Transferred to DPR', false, 200),
    ('6a4d3c27e6399bdb4ba47eb6', '6a8d940e363ce11dc76ed901', '239 joints', true, 100),
    ('6a4d3c27e6399bdb4ba47eb6', '6a8d944674a2078f4fec6736', 'Transferred to HB', true, 200),
    ('6a4d3c27e6399bdb4ba47eb6', '6a8d943390ff4c4e38098fb2', '32 joints', false, 100),
    ('6a4d3c27e6399bdb4ba47eb6', '6a8d9439c8a6f8eb9bb2732e', 'Transferred to HB', true, 200),
    ('6a4d3c27e6399bdb4ba47eb6', '6a8d943ea5cb7dcf4fa937e7', 'Transferred to DPR', false, 300),
    ('6a4d3c27e6399bdb4ba47eb6', '6a8d942bf269ef4c82901a28', '45 joints', true, 100),
    ('6a4e6c6ac073b92817fe7f01', '6a6a45cb093e507b1fc2bfcf', '4 joints', true, 100),
    ('6a4e6c6ac073b92817fe7f01', '6a6a45c738afff9ed7b88004', '1 joint', false, 100),
    ('6a4e6c6ac073b92817fe7f01', '6a6a45d3c8902f0618f5029e', 'Transferred to DPR', false, 200),
    ('6a4e6c6ac073b92817fe7f01', '6a6a45c40a90dccc9a62510b', '3 joints', true, 100),
    ('6a57ecb4685549c393aed84a', '6a6a47f1ae391645a667e3f4', '40 joints', true, 100),
    ('6a57ecb4685549c393aed84a', '6a6a47f3ce769acded8b2946', '1 joint', true, 100),
    ('6a57ecb4685549c393aed84a', '6a6a47f74bdcd57a54ee2969', '1 joint', true, 100),
    ('6a69f6bdc866f596c62854a6', '6a8d98937a332adc678ee004', '7 joints', true, 100),
    ('6a69f6bdc866f596c62854a6', '6a8d98996dafb72a76c3a922', 'Transferred to PMR', true, 200),
    ('6a69f6bdc866f596c62854a6', '6a8d989ef382c9c48af75928', '1 joint', true, 100),
    ('6a7b612b7ae8ca39a4fbcf74', '6a8dcb65074fe3f0b8e161ac', '757 joints', false, 100),
    ('6a7b612b7ae8ca39a4fbcf74', '6a8dcb69d27ad689dfd4ce3f', '67 joints', false, 100),
    ('6a7b612b7ae8ca39a4fbcf74', '6a8dcb6ea238d13cd3ce4271', 'Transferred to PMR', true, 200),
    ('6a7b612b7ae8ca39a4fbcf74', '6a8dcb73ec74cf9f39a20320', '47 joints', false, 100),
    ('6a7b612b7ae8ca39a4fbcf74', '6a8dcb7b5ec62677dff5cb16', 'Transferred to HB', true, 200),
    ('6a7b612b7ae8ca39a4fbcf74', '6a8dcb80de331ea9daabf622', '2 joints', false, 100),
    ('6a7b612b7ae8ca39a4fbcf74', '6a8dcb863b183caa597f2e9f', 'Transferred to HB', false, 200),
    ('6a7b612b7ae8ca39a4fbcf74', '6a8dcb8ac38391510faafce5', 'Transferred to PMR', true, 300),
    ('6a7b612b7ae8ca39a4fbcf74', '6a8dcb904401da6c891c9101', '1 joint', true, 100),
    ('689fcac613e0310468f6a3fe', '68a5bd864704a14e0fc1acc6', '5 jts', true, 100),
    ('689fcac613e0310468f6a3fe', '68a5bdbb111dc59e4fa879aa', '33 jts joints transferred to HB', true, 100),
    ('689fcac613e0310468f6a3fe', '68c03f6f9f427e7a61ab98e5', '33 joints received from HB', true, 200),
    ('689fcac613e0310468f6a3fe', '68a5bdc3dcb988c9b1389305', '19 joints transferred to DPR', true, 100),
    ('689fcac613e0310468f6a3fe', '68a5be0be8804eaab20a59f4', '1 bent transferred to PMR', true, 200),
    ('689fcac613e0310468f6a3fe', '68cdd79d1c4eaa2d6a7ae470', '1 bent received from PMR', true, 300),
    ('689fcac613e0310468f6a3fe', '68fa6b551ce0d42c9de30519', '19 joints received from DPR', true, 400),
    ('689fcac613e0310468f6a3fe', '68a5bdced6bb6a2685ed369d', '351 jts', true, 100),
    ('689fcac613e0310468f6a3fe', '68a5bded5b8b21aea12aa059', '195 jts', true, 100),
    ('689fcac613e0310468f6a3fe', '68a5be3ccee2ab171c56e069', '15 jts HB + Reface', true, 200),
    ('68b0ba83ba769576fc04514b', '68b1c992b43de77d88b5aa48', '643 joints received', true, 100),
    ('68b0ba83ba769576fc04514b', '68bb1a963e9ee5189a1b5b54', '61 joints sent to PMR', true, 100),
    ('68b0ba83ba769576fc04514b', '68bb1ae133df272edf6f626b', '61 joints received from PMR', true, 200),
    ('68b0ba83ba769576fc04514b', '68bb1a8f85335ef17d73fda4', '51 joints sent to HB', true, 100),
    ('68b0ba83ba769576fc04514b', '68bb1aea8e347a4d21f3f1c4', '51 joints received from HB', true, 200),
    ('68b0ba83ba769576fc04514b', '68bb1a82e0c94dc51a6ea423', '2 joints', true, 100),
    ('68b0ba83ba769576fc04514b', '68bb1a9f270a932dd6227bf7', '523 joints rig ready', true, 100),
    ('68b0ba83ba769576fc04514b', '68bb1a7d87995ad57a5283bd', '6 joints sent to PMR', true, 100),
    ('68b0ba83ba769576fc04514b', '68bb1b25055ae82e1f5e9044', '6 joints received from PMR', true, 200),
    ('68b0ba83ba769576fc04514b', '68bb1b2e7b1afbd7c3902531', '6 joints sent to HB', true, 300),
    ('68b0ba83ba769576fc04514b', '68bb1b3675f62d5bc44e0da0', '6 joints received from HB', true, 400),
    ('699ccc1ad0efab958d8f548e', '699ccc4fd2c1e9883349ee13', '301 joints of 2 3/8 FSS-247', true, 100),
    ('699ccc1ad0efab958d8f548e', '699ccc5e051bea7068abbf04', '346 joints of 2 7/8 FSS-265', true, 200),
    ('699ccc1ad0efab958d8f548e', '699ccc7cd6b96b3ce02c4f8a', '105 joints of 2 3/8 FSS-247', true, 100),
    ('699ccc1ad0efab958d8f548e', '699ccca477151e6a0645cad8', '93 joints of 2 7/8 FSS-265', true, 200),
    ('699ccc1ad0efab958d8f548e', '699cccc67b71563bd91cb90d', '8 joints of 2 3/8 FSS-247', true, 100),
    ('699ccc1ad0efab958d8f548e', '699cccd1f81562c85305df11', '4 joints of 2 7/8 FSS-265', true, 200),
    ('699ccc1ad0efab958d8f548e', '699ccce48b221b2e7068ebd2', '77 joints of 2 3/8 FSS-247', true, 100),
    ('699ccc1ad0efab958d8f548e', '699cccec2416a606416c7ac9', '1 joint of 2 7/8 FSS-265', true, 200),
    ('699ccc1ad0efab958d8f548e', '699ccd0564681a7ff2a89112', '19 joints of 2 3/8 FSS-247', true, 100),
    ('699ccc1ad0efab958d8f548e', '699ccd1378c39930452cbc12', '1 joint of 2 7/8 FSS-265', true, 200),
    ('699cd1870a31f705343a4cd1', '699cd198f81562c8530d30c9', '155 joints', true, 100),
    ('699cd1870a31f705343a4cd1', '699cd1aa000b9b78e938659e', '16 Bent', true, 100),
    ('699cd1870a31f705343a4cd1', '699cd1c1b7c4e88b716aeb92', '14 joints', true, 100),
    ('699cd270809d85eb996970e0', '699cd28d2a36152f52b4429b', '200 Joints of 2 3/8 FSS-247', true, 100),
    ('699cd270809d85eb996970e0', '699cd2a67b2e25bfcebf56ca', '413 joints of 2 7/8 FSS-265', true, 200),
    ('699cd270809d85eb996970e0', '699cd2bda968ba373c5861b1', '53 joints of 2 3/8 FSS-247', true, 100),
    ('699cd270809d85eb996970e0', '699cd2c97702955e2b9b08c0', '108 joints of 2 7/8 FSS-265', true, 200),
    ('699cd270809d85eb996970e0', '699cd2e1b3524f555606cc7f', '77 joints of 2 3/8 FSS-247', true, 100),
    ('699cd270809d85eb996970e0', '699cd2ed7b1a8f56f6ebc799', '3 joints of 2 7/8 FSS-265', true, 200),
    ('699cd270809d85eb996970e0', '699cd30244f7c7ba5261dc33', '30 joints of 2 3/8 FSS-247', true, 100),
    ('699cd270809d85eb996970e0', '699cd314ec99eaa28089e5b8', '5 joints of 2 3/8 FSS-247', true, 100),
    ('699cd270809d85eb996970e0', '699cd31ca501204f807375f9', '25 joints of 2 7/8 FSS-265', true, 200),
    ('699dcb878076355b71e4274e', '699dcb98e40c3d041fd7c599', '746 joints', true, 100),
    ('699dcb878076355b71e4274e', '699dcbb2607ff61f462e2133', '70 joints', true, 100),
    ('699dcb878076355b71e4274e', '699dcbbe8721dfe0153e5261', '56 joints', true, 100),
    ('699dcb878076355b71e4274e', '699dcbcd5b20f002104807fc', '7 joints', true, 100),
    ('699dcb878076355b71e4274e', '699dcbd9322d848b65283400', '1 joint', true, 100),
    ('69a79fc0c7725c708ab61cbf', '69b029e172c021aaf4a88cec', '438 joints', true, 100),
    ('69a79fc0c7725c708ab61cbf', '69b029f97eff6e1ecddf1ffc', '173 joints', true, 100),
    ('69a79fc0c7725c708ab61cbf', '69bd636d95f293923b5ada40', '2 bent', true, 200),
    ('69a79fc0c7725c708ab61cbf', '69b02a3d5dee2ef015125d8f', '141 joints', true, 100),
    ('69a79fc0c7725c708ab61cbf', '69b02a635a8ac1bc2b3fb41c', '42 joints', true, 100),
    ('69a79fc0c7725c708ab61cbf', '69b02a6b878792a93e359947', '32 joints', true, 100),
    ('69bd5e649cdfe4d8cbead45b', '6a0b725957caafcf14c99af4', '27 joints', true, 100),
    ('69bd5e649cdfe4d8cbead45b', '6a0b726bdfe33f483b1e9296', '12 joints', true, 100),
    ('69c5a710eb4eb1108e132d48', '69d04382b58749783890ee4b', '411 joints', true, 100),
    ('69c5a710eb4eb1108e132d48', '69d0438fc62bcbb844879ef1', '101 joints', true, 100),
    ('69c5a710eb4eb1108e132d48', '69d0442b3b52c45a8d28a7e8', 'Transferred to PMR', true, 200),
    ('69c5a710eb4eb1108e132d48', '69d043a4457e442bf6f58918', '76 joints', true, 100),
    ('69c5a710eb4eb1108e132d48', '69d043bda90f7df061019b00', 'Transferred to HB', true, 200),
    ('69c5a710eb4eb1108e132d48', '69d0443463132cec555e2610', 'Transferred to PMR', true, 300),
    ('69c5a710eb4eb1108e132d48', '69d043b2abcf1385b2880095', '461 joints', true, 100),
    ('69c5a710eb4eb1108e132d48', '69d043c251478725420aaa70', 'Transferred to HB', true, 200),
    ('69c5a710eb4eb1108e132d48', '69d043d0e4966fd9b5385be6', '2 joints', true, 100),
    ('69d50bc4d67280d6d494440a', '69e248a1751d3e74ecb00d70', '161 joints', true, 100),
    ('69d50bc4d67280d6d494440a', '69e248b76b2cb95a86cf1c68', '11 joints', true, 100),
    ('69d50bc4d67280d6d494440a', '69e248d2a7bf7c76f7cbd3bd', '21 joints', true, 100),
    ('69d50bc4d67280d6d494440a', '69e248efec4741a8ad4cd683', '54 joints', true, 100),
    ('69d50bc4d67280d6d494440a', '69e248f837c4f95f979f94c4', '8 joints (Slick)', true, 200),
    ('69d50bc4d67280d6d494440a', '69e2490065cccbab1f460c4b', 'Transferred to PMR', true, 300),
    ('69d50bc4d67280d6d494440a', '69e249f0955a38f1c596b893', '2 joints', true, 100),
    ('69d50bc4d67280d6d494440a', '69e249fada2b0890fa080fba', 'Transferred to HB', true, 200),
    ('69d50bc4d67280d6d494440a', '69e24a06635bb5960d8e11e5', '43 joints', true, 100),
    ('69d67ce6750eefbd032db97e', '6a0b72a3b82afb32d2f32c53', '274 joints', true, 100),
    ('69d67ce6750eefbd032db97e', '6a0b72c3549b17072d311bb2', '60 joints', true, 100),
    ('69d67ce6750eefbd032db97e', '6a0b72d196841eb52ac210e5', '19 joints', true, 100),
    ('6a15e65aefeea1206886833c', '6a2196fd757a5a63defadff5', '55 joints', true, 100),
    ('6a15e65aefeea1206886833c', '6a21971a967750e194f19011', '71 joints', true, 100),
    ('6a15e65aefeea1206886833c', '6a219723815634819a9047de', 'Transferred to PMR', true, 200),
    ('6a15e65aefeea1206886833c', '6a2197392971643cd2a264cf', '515 joints', true, 100),
    ('6a15e937cc72402b3cb6cece', '6a2197c1eca6ef4a59679f41', '1 joint', true, 100),
    ('6a15e937cc72402b3cb6cece', '6a2197ce71ab760d7876597c', '59 joints', true, 100),
    ('6a15e937cc72402b3cb6cece', '6a2197d37ab4ac45f80298ed', 'transferred to PMR', true, 200),
    ('6a15e937cc72402b3cb6cece', '6a2197e0a6b6fe76d82e769f', '937 joints', true, 100),
    ('6a15e95de42c9cbad06dc7a9', '6a21987b2349cc98dfa8e989', '493 joints', true, 100),
    ('6a15e95de42c9cbad06dc7a9', '6a219884d7e525378b8cdfb8', '92 joints', true, 100),
    ('6a15e95de42c9cbad06dc7a9', '6a21988ca911bd80c4c8663f', 'transferred to PMR', true, 200),
    ('6a15e95de42c9cbad06dc7a9', '6a219899b657ba987709eb3a', '330 joints', true, 100),
    ('6a15e95de42c9cbad06dc7a9', '6a2198a5927f927fadc02031', '81 joints', true, 100),
    ('6a15e95de42c9cbad06dc7a9', '6a2198b2d54731cd815fd90b', 'transferred to HB', true, 200),
    ('6a15e95de42c9cbad06dc7a9', '6a24282940ad540a71777ec6', 'Transferred to PMR', true, 300),
    ('6a15e95de42c9cbad06dc7a9', '6a242918ac6cc64f69fc7e86', 'PMR complete', true, 400),
    ('6a15e95de42c9cbad06dc7a9', '6a2198fb2ce0fd786a905e5c', '2 joints', true, 100),
    ('6a15e9dc89f47812c3be7836', '6a302e24d57a4ad453896688', '575 joints', true, 100),
    ('6a15e9dc89f47812c3be7836', '6a302e30cd1bba71e405399a', '65 joints', true, 100),
    ('6a15e9dc89f47812c3be7836', '6a30303f1d82b2706f9e0a9d', 'Transferred to DPR', true, 200),
    ('6a15e9dc89f47812c3be7836', '6a302e4f6f7569621cf8b802', '4 joints', false, 100),
    ('6a15e9dc89f47812c3be7836', '6a302e709ebc142cbe105217', 'Transferred to HB', false, 200),
    ('6a15e9dc89f47812c3be7836', '6a302e55fcc710b5418d948b', '4 joints', true, 100),
    ('6a15e9dc89f47812c3be7836', '6a302e631d19b7b28c1387d0', 'Transferred to HB', true, 200),
    ('6a15e9dc89f47812c3be7836', '6a30303948268783ab08d4b2', 'transferred to DPR', false, 300),
    ('6a15e9dc89f47812c3be7836', '6a302e58fdddc18c854cfcd7', '10 joints', true, 100),
    ('6a2f0f5affd6664ed4284e53', '6a42d752b36e7a3d6b705ba1', '560 joints', true, 100),
    ('6a2f0f5affd6664ed4284e53', '6a42d771beac7fede6898aa3', '48 joints', true, 100),
    ('6a2f0f5affd6664ed4284e53', '6a42d777737afcb07dcb7cd4', 'transferred to PMR', true, 200),
    ('6a2f0f5affd6664ed4284e53', '6a42d7976f4b09bdc9a41c5d', '17 joints', true, 100),
    ('6a2f0f5affd6664ed4284e53', '6a42d79e2b2958c9d10b978d', 'transferred to HB', true, 200),
    ('6a2f0f5affd6664ed4284e53', '6a42d7a3402ba314e68ed35e', '2 joints', false, 100),
    ('6a2f0f5affd6664ed4284e53', '6a42d7a9d2935079cd70ac78', 'transferred to PMR', true, 200),
    ('6a2f0f5affd6664ed4284e53', '6a42d7b3ee7e2de9836df212', 'transferred to HB', false, 300),
    ('6a2f0f5affd6664ed4284e53', '6a42d7be7b1be94f8a8e0435', '19 joints', true, 100),
    ('6a5e66d5dbf27c8109d0cd0e', '6a8d9532a156917a3f951a6b', '275 joints', true, 100),
    ('6a5e66d5dbf27c8109d0cd0e', '6a8d953acef8772c37899662', '33 joints', false, 100),
    ('6a5e66d5dbf27c8109d0cd0e', '6a8d953f0bc3a7f8bf270b0b', 'Transferred to PMR', false, 200),
    ('6a5e66d5dbf27c8109d0cd0e', '6a8d9545a4b00fbd5d1931ca', '6 joints', false, 100),
    ('6a5e66d5dbf27c8109d0cd0e', '6a8d954b1a979f91f6ae9608', 'Transferred to HB', true, 200),
    ('6a5e66d5dbf27c8109d0cd0e', '6a8d955532c72c6643843fe8', '6 joints', true, 100),
    ('6a69f59f40b33a7b3032c987', '6a8d97e7e45b0aa47982752e', '5 joints', true, 100),
    ('6a69f59f40b33a7b3032c987', '6a8d97ef29fd0e4d76731da4', '21 joints', true, 100),
    ('6a69f59f40b33a7b3032c987', '6a8d97f500a7107bd0723a44', 'Transferred to PMR', true, 200),
    ('6a69f59f40b33a7b3032c987', '6a8d97fecdb32b6176084d41', '2 joints', true, 100),
    ('6a7088cf9e06f4b9bbb83158', '6a8d9ae451c172f81b0658c3', '702 joints', true, 100),
    ('6a7088cf9e06f4b9bbb83158', '6a8d9aecd725cad341835ca6', '82 joints', false, 100),
    ('6a7088cf9e06f4b9bbb83158', '6a8d9af060f01db81cce0a28', 'Transferred to PMR', true, 200),
    ('6a7088cf9e06f4b9bbb83158', '6a8d9af7155bd968022af075', '67 joints', false, 100),
    ('6a7088cf9e06f4b9bbb83158', '6a8d9afce49977e380bf6d06', 'Transferred to HB', true, 200),
    ('6a7088cf9e06f4b9bbb83158', '6a8d9b01c81c5015684fa047', '11 joints', false, 100),
    ('6a7088cf9e06f4b9bbb83158', '6a8d9b05fb203917e8e332bd', 'Transferred to HB', false, 200),
    ('6a7088cf9e06f4b9bbb83158', '6a8d9b09e9b1b58e21a90a5d', 'Transferred to PMR', true, 300),
    ('6a7088cf9e06f4b9bbb83158', '6a8d9b0fadb8e638a9fc82bd', '2 joints', true, 100),
    ('6894d618026eb610c0b18843', '6894da1cdc1c8e0984fb0d6b', 'Outgoing', true, 100),
    ('6894d618026eb610c0b18843', '6894da224137f73c9d4024bf', 'Incoming', true, 200),
    ('6894d759e2c4c293c1b74e59', '6894dac5f63cb5ed57ff972a', '495 joints - verified from Inspection Summary', true, 100),
    ('6894d759e2c4c293c1b74e59', '689ba95a2a80cdb663a751ca', '388 joints - shipped', true, 200),
    ('6894d759e2c4c293c1b74e59', '689baa13d2c9a320b7bff65f', '265 joints in yard rig ready', true, 300),
    ('6894d759e2c4c293c1b74e59', '6894daec25ab32fe516a8862', '28 joints', true, 100),
    ('6894d759e2c4c293c1b74e59', '6894db52fb3f4056d2a4c9b1', '6 MSR Complete + HB', true, 200),
    ('6894d759e2c4c293c1b74e59', '6894db4614786039c4258815', '124 MSR only', true, 100),
    ('6894d759e2c4c293c1b74e59', '6894db69c1c0e7f8e5ca78fd', '3 DBR verified in PIFS Yard', true, 100),
    ('69260669a3077b4684810276', '699efbc6a2a44a60bd469dad', '405 joints', true, 100),
    ('693c4839ac7e437b70ed8f3a', '693c48d04b12f6567921063a', '326 Joints', true, 100),
    ('693c4839ac7e437b70ed8f3a', '693c48e505e61ed381f76b82', '18 joints', true, 100),
    ('693c4839ac7e437b70ed8f3a', '693c490e97fb4645faa6849d', '113 joints transferred to DPR', true, 100),
    ('693c4839ac7e437b70ed8f3a', '693c49157adfbc90d8bfb879', '113 joints received from DPR', true, 200),
    ('693c4839ac7e437b70ed8f3a', '693c493ef40f5ab8c8314f6e', '39 joints transferred to HB', true, 100),
    ('693c4839ac7e437b70ed8f3a', '693c494bcabf2599c472cc29', '39 joints received from HB', true, 200),
    ('693c4839ac7e437b70ed8f3a', '693c495c27043c7d4d405dba', '39 joints transferred to DPR', true, 300),
    ('693c4839ac7e437b70ed8f3a', '693c4967fb426b7b2b08662d', '39 joints received from DPR', true, 400),
    ('693c4839ac7e437b70ed8f3a', '693c49b4b019491ea55d01e1', '157 joints transferred to HB', true, 100),
    ('693c4839ac7e437b70ed8f3a', '693c49bb133e3ee82ccbdb97', '157 received from HB', true, 200),
    ('693c4bc0551d41238dc98f89', '696a65f20aa87db07b39f9d3', '15 joints', true, 100),
    ('693c4bc0551d41238dc98f89', '696a66959c2a9af4c850495d', '186 joints', true, 100),
    ('693c4bc0551d41238dc98f89', '696a66d92ae0d3e356e34f33', '42 joints', true, 100),
    ('693c4bc0551d41238dc98f89', '696a66f7513fb462cbe585e0', '79 joints', true, 100),
    ('693c4bc0551d41238dc98f89', '696a670cc87ae4d9d5238a5d', '345 joints', true, 100),
    ('69a1b68d766df20225af639f', '69a1b6f810c71be89666be89', '6 joints of 2 3/8 FSS-247', true, 100),
    ('69a1b68d766df20225af639f', '69b028587dcc05eae7767bf0', '184 joints of 2 7/8 FSS-265', true, 200),
    ('69a1b68d766df20225af639f', '69b0299f58e639687fae5148', '72 joints of 2 3/8 FSS-247', true, 300),
    ('69a1b68d766df20225af639f', '69a1b70da3a4b4bc1ecdde69', '49 joints of 2 3/8 FSS-247', true, 100),
    ('69a1b68d766df20225af639f', '69a1b71366fe69ab2a934b7c', '26 joints of 2 7/8 FSS-265', true, 200),
    ('69a1b68d766df20225af639f', '69b028ce96d3d291fd873828', '191 joints of 2 7/8 FSS-265', true, 300),
    ('69a1b68d766df20225af639f', '69b028df0e06755938b73402', '107 joints of 2 3/8 FSS-247', true, 400),
    ('69a1b68d766df20225af639f', '69a1b72cac5b738222648f95', '15 joints of 2 3/8 FSS-247', true, 100),
    ('69a1b68d766df20225af639f', '69a1b732f1044014eba8e3e2', '3 joints of 2 7/8 FSS-265', true, 200),
    ('69a1b68d766df20225af639f', '69b028f751a32b812e50ae26', '50 joints of 2 7/8 FSS-265', true, 300),
    ('69a1b68d766df20225af639f', '69b0290de6113adf0f4647e2', '109 joints of 2 3/8 FSS-247', true, 400),
    ('69a1b68d766df20225af639f', '69b0298cd0ba39729370f944', 'Transferred to HB', true, 500),
    ('69a1b68d766df20225af639f', '69a1b74db14de5b1be0a0fc0', '1 joint of 2 3/8 FSS-247', true, 100),
    ('69a1b68d766df20225af639f', '69b0292f3074437c476b7c8d', '66 joints of 2 7/8 FSS-265', true, 200),
    ('69a1b68d766df20225af639f', '69b0293d119818b5a3a50417', '224 joints of 2 3/8 FSS-265', true, 300),
    ('69a1b68d766df20225af639f', '69b0297a40de9dec73835e0d', 'Transferred to HB', true, 400),
    ('69a1b68d766df20225af639f', '69a1b75f23ffbb6ca8567c5e', '2 joints of 2 3/8 FSS-247', true, 100),
    ('69a1b68d766df20225af639f', '69a1b7680d1a634c498ce5aa', '2 joints of 2 7/8 FSS-265', true, 200),
    ('69a1b68d766df20225af639f', '69b0294649d8113307e220a6', '11 joints of 2 7/8 FSS-265', true, 300),
    ('69a1b68d766df20225af639f', '69b02965d6982b90ae1715d2', '13 joints of 2 3/8 FSS-247', true, 400),
    ('6a01d00ad4998d15b18eee99', '6a16e1670ca56942b9bc10d3', '185 joints', true, 100),
    ('6a01d00ad4998d15b18eee99', '6a16e172ca6da646d70b3d54', '48 joints', true, 100),
    ('6a01d00ad4998d15b18eee99', '6a2428c349e989f36a7eb477', 'Transferred to PMR', true, 200),
    ('6a01d00ad4998d15b18eee99', '6a16e17d2066cbfe7702a7bd', '2 joints', true, 100),
    ('6a01d00ad4998d15b18eee99', '6a2428cbc2d260bf0f68e759', 'Transferred to HB', true, 200),
    ('6a01d00ad4998d15b18eee99', '6a16e18d7b1a457544a0695a', '11 joints', true, 100),
    ('6a01d051f93b2dc5bb907cf2', '6a0f357117d2b5e98de31017', '276 joints', true, 100),
    ('6a01d051f93b2dc5bb907cf2', '6a0f357b04aa9d1429840f43', '16 joints', true, 100),
    ('6a01d051f93b2dc5bb907cf2', '6a0f35875327ef27f216c0b0', '2 joints', true, 100),
    ('6a15e909ef5456f347eea0a7', '6a302d3a5f0ae712da81e35b', '485 joints', true, 100),
    ('6a15e909ef5456f347eea0a7', '6a302d49f40b1c402e5f4b0b', '86 joints', true, 100),
    ('6a15e909ef5456f347eea0a7', '6a302d9ddc06d30f0ef81f9b', 'transferred to PMR', true, 200),
    ('6a15e909ef5456f347eea0a7', '6a302d57b3266e7196d0d975', '5 joints', true, 100),
    ('6a15e909ef5456f347eea0a7', '6a302da4152c94c394632a32', 'Transferred to PMR', true, 200),
    ('6a15e909ef5456f347eea0a7', '6a302da910df791bf14b2744', 'Transferred to HB', true, 300),
    ('6a15e909ef5456f347eea0a7', '6a302d6a9c9b8f05c31ab987', '50 joints', true, 100),
    ('6a15e909ef5456f347eea0a7', '6a302d7703a32ba2232aacc4', 'transferred to HB', true, 200),
    ('6a15e909ef5456f347eea0a7', '6a302d8b10756b0a08b9bf4d', '12 joints', true, 100),
    ('6a1db0ac857b7be520aac8db', '6a4d0af916983e0f4cddfe74', '256 joints', true, 100),
    ('6a1db0ac857b7be520aac8db', '6a4d0b0690d3e12db054370c', '40 joints', true, 100),
    ('6a1db0ac857b7be520aac8db', '6a4d0b4ab0da2e8a24c4b638', 'transferred to DPR', true, 200),
    ('6a1db0ac857b7be520aac8db', '6a4d0b22d729a514fcec3b9b', '35 joints', true, 100),
    ('6a1db0ac857b7be520aac8db', '6a4d0b2b10628441797ed39a', 'transferred to HB', true, 200),
    ('6a1db0ac857b7be520aac8db', '6a4d0b2fa1e02ae8554475c0', '5 joints', false, 100),
    ('6a1db0ac857b7be520aac8db', '6a4d0b33673f27323ed65ee9', 'transferred to HB', true, 200),
    ('6a1db0ac857b7be520aac8db', '6a4d0b3e9a941692507e4a1b', 'transferred to DPR', false, 300),
    ('6a1db0ac857b7be520aac8db', '6a4d0b50e71ed65e0217a398', '15 joints', true, 100),
    ('6a32fd57894255249e573518', '6a43a6c963763f6a7dc43aab', '561 joints', true, 100),
    ('6a32fd57894255249e573518', '6a43a6b5e1582ff8422dec13', '106 joints', false, 100),
    ('6a32fd57894255249e573518', '6a43a6d622fa38c2fba3029c', 'transferred to DPR', true, 200),
    ('6a32fd57894255249e573518', '6a43a6ac7f65e1a9f73b37a0', '16 joints', false, 100),
    ('6a32fd57894255249e573518', '6a43a6e1b341410bf8bf8cdf', 'transferred to HB', true, 200),
    ('6a32fd57894255249e573518', '6a43a69efd65adebec446c1c', '27 joints', true, 100),
    ('6a45984a125be001ee185f26', '6a6a398a7b84cd88ed59bde4', '457 joints', true, 100),
    ('6a45984a125be001ee185f26', '6a6a399eccf1bc5417c72bb3', '112 joints', true, 100),
    ('6a45984a125be001ee185f26', '6a6a39a8e7acb6999d9af15a', 'Transferred to PMR', true, 200),
    ('6a45984a125be001ee185f26', '6a6a39af8988b3cd6455f07f', '4 joints', false, 100),
    ('6a45984a125be001ee185f26', '6a6a39b774c6953bb37bafa2', 'Transferred to PMR', true, 200),
    ('6a45984a125be001ee185f26', '6a6a39c4b035d914f4ac8426', 'Transferred to HB', true, 300),
    ('6a45984a125be001ee185f26', '6a6a39cf5545684f019fb40c', '14 joints', true, 100),
    ('6a45984a125be001ee185f26', '6a6a39cfd0e6fefa14fde637', 'Transferred to HB', true, 200),
    ('6a45984a125be001ee185f26', '6a6a39cf39e3415f0b3cd547', '108 joints', true, 100),
    ('6a4598738600ffd47372defd', '6a6a3bf531717d15bffe01a0', '728 joints', true, 100),
    ('6a4598738600ffd47372defd', '6a6a3c02104ae45175c8cc14', '61 joints', true, 100),
    ('6a4598738600ffd47372defd', '6a6a3c0a92a6eb97e509abdf', 'Transferred to PMR', true, 200),
    ('6a4598738600ffd47372defd', '6a6a3c3f779b482a2ed809bb', '103 joints', true, 100),
    ('6a4598738600ffd47372defd', '6a6a3c44efc3d87ee01fd3cc', 'Transferred to HB', true, 200),
    ('6a4598738600ffd47372defd', '6a6a3c2820b631d9d427b1f5', '7 joints', true, 100),
    ('6a4598738600ffd47372defd', '6a6a3c2d1ac231445e14a2e2', 'Transferred to PMR', true, 200),
    ('6a4598738600ffd47372defd', '6a6a3c320caffed75ff982c2', 'Transferred to HB', true, 300),
    ('6a4598738600ffd47372defd', '6a6a3c21a23eec212ad66bc3', '1 joint', true, 100),
    ('6a46bf68c68623249cfe640e', '6a4d74e9fe77b1b28f8dd75d', '311 joints', true, 100),
    ('6a46bf68c68623249cfe640e', '6a4d74da9b3a6a36db91d675', '38 joints', false, 100),
    ('6a46bf68c68623249cfe640e', '6a4d74e2c36d291bd7de7681', 'Transferred to PMR', true, 200),
    ('6a46bf68c68623249cfe640e', '6a4d74d6c9aea97dd6fcf8d1', '11 joints', true, 100),
    ('6a60c6c2fb6d74ff097d782a', '6a8d9617b14431aeac6d9269', '582 joints', true, 100),
    ('6a60c6c2fb6d74ff097d782a', '6a8d961dfeaf59a72715d908', '23 joints', false, 100),
    ('6a60c6c2fb6d74ff097d782a', '6a8d9623ef6496b8fad005e7', 'Transferred to PMR', true, 200),
    ('6a60c6c2fb6d74ff097d782a', '6a8d962c7a3e0a7bcafdefc8', '272 joints', false, 100),
    ('6a60c6c2fb6d74ff097d782a', '6a8d965838175faf4c9a8d79', 'Transferred to HB', true, 200),
    ('6a60c6c2fb6d74ff097d782a', '6a8d963340cdb8e2954a077c', '2 joints', false, 100),
    ('6a60c6c2fb6d74ff097d782a', '6a8d963c64c7b58a63bc6fed', 'Transferred to HB', true, 200),
    ('6a60c6c2fb6d74ff097d782a', '6a8d964447ed3bab62ad66c1', 'Transferred to PMR', false, 300),
    ('6a60c6c2fb6d74ff097d782a', '6a8d96515f51e7a287a470d3', '1 joint', true, 100),
    ('6a6c3321eba7b40a9494cc62', '6a8d9a0369eabddaffffcb34', '190 joints', true, 100),
    ('6a6c3321eba7b40a9494cc62', '6a8d9a0a6188aed35c6b88ba', '38 joints', false, 100),
    ('6a6c3321eba7b40a9494cc62', '6a8d9a0f8a245aa73af2f200', 'Transferred to DPR', false, 200),
    ('6a6c3321eba7b40a9494cc62', '6a8d9a1459961fe068546524', '24 joints', false, 100),
    ('6a6c3321eba7b40a9494cc62', '6a8d9a1af8dcf4b11e0af13a', 'Transferred to HB', true, 200),
    ('6a6c3321eba7b40a9494cc62', '6a8d9a1f696a28e6df16ce76', '1 joint', false, 100),
    ('6a6c3321eba7b40a9494cc62', '6a8d9a26bc2f6e2a3994a9c8', 'Transferred to DPR', false, 200),
    ('6a6c3321eba7b40a9494cc62', '6a8d9a2b38508c96c9f9a80b', '7 joints', true, 100),
    ('6a6c33268b677df14582beae', '6a8d999bd37ab771aa89ed6a', '561 joints', true, 100),
    ('6a6c33268b677df14582beae', '6a8d99a0d8597c9051cf8208', '34 joints', false, 100),
    ('6a6c33268b677df14582beae', '6a8d99a6c80c2c1a4c61649b', 'Transferred to DPR', false, 200),
    ('6a6c33268b677df14582beae', '6a8d99ad3dde970d2d31192b', '31 joints', false, 100),
    ('6a6c33268b677df14582beae', '6a8d99b141bcf5fbfc3569ca', 'Transferred to HB', true, 200),
    ('6a6c33268b677df14582beae', '6a8d99bd6bfee568bddd533f', '2 joints', false, 100),
    ('6a6c33268b677df14582beae', '6a8d99c26b492eebd809eaa0', 'Transferred to HB', true, 200),
    ('6a6c33268b677df14582beae', '6a8d99c79c17219e93bfe511', 'Transferred to DPR', false, 300),
    ('6a6c33268b677df14582beae', '6a8d99cdf52c9f78add62b71', '15 joints', false, 100),
    ('6a75d2155d62f5c41114360e', '6a8dcaaac959c690105d6722', '365 joints', true, 100),
    ('6a75d2155d62f5c41114360e', '6a8dcab0913bc73956954220', '9 joints', false, 100),
    ('6a75d2155d62f5c41114360e', '6a8dcab81c4085fa88ad1826', 'Transferred to PMR', true, 200),
    ('6a75d2155d62f5c41114360e', '6a8dcabcd2be6ab9bc20829c', '1 joint', true, 100),
    ('6a650713f375aec8b39c54ca', '6a8d973a4d543c32080e92e7', '29 joints', true, 100),
    ('6a70a4fb1ad443686a5008de', '6a8da99992adace7282e155d', '216 joints', false, 100),
    ('6a70a4fb1ad443686a5008de', '6a8da99f8832ccf06683a170', '106 joints', false, 100),
    ('6a70a4fb1ad443686a5008de', '6a8da9a7276aef52ada9815d', 'Transferred to DPR', false, 200),
    ('6a70a4fb1ad443686a5008de', '6a8da9ba0f35108df90d39df', '276 joints', false, 100),
    ('6a70a4fb1ad443686a5008de', '6a8da9bdb065edea84be0f04', 'Transferred to HB', true, 200),
    ('6a70a4fb1ad443686a5008de', '6a8da9c5064de95572135ee7', '81 joints', false, 100),
    ('6a70a4fb1ad443686a5008de', '6a8da9c8f4555e36d9c850ab', 'Transferred to HB', true, 200),
    ('6a70a4fb1ad443686a5008de', '6a8da9cd5d3f93a62f8e673b', 'Transferred to DPR', false, 300),
    ('6a70a4fb1ad443686a5008de', '6a8da9d5a3437043e2479b1b', '59 joints', true, 100),
    ('6a75d02c583c42a4efebc9b8', '6a8dc6ecd85fd4a3b49cc6f7', '759 joints', true, 100),
    ('6a75d02c583c42a4efebc9b8', '6a8dc6f4411e452739512ecb', '27 joints', false, 100),
    ('6a75d02c583c42a4efebc9b8', '6a8dc6fb06b73bb6724e5977', 'Transferred to PMR', true, 200),
    ('6a75d02c583c42a4efebc9b8', '6a8dc71efaa154ccaa83fdef', '13 joints', false, 100),
    ('6a75d02c583c42a4efebc9b8', '6a8dc722798123e351d0de80', 'Transferred to HB', true, 200),
    ('6a75d02c583c42a4efebc9b8', '6a8dc7041d2575d301b030e3', '1 joint', false, 100),
    ('6a75d02c583c42a4efebc9b8', '6a8dc709a0b214781ca3eb42', 'Transferred to PMR', true, 200),
    ('6a75d02c583c42a4efebc9b8', '6a8dc716f714011910bc0d03', 'Transferred to HB', false, 300),
    ('6a75d02c583c42a4efebc9b8', '6a8dc72b8d22f70ae3666dba', '1 joint', true, 100)
)
insert into public.service_board_card_checklist (card_id, label, is_done, sort_order, source_type, source_id)
select card.id, seed.label, seed.is_done, seed.sort_order, 'trello_tubing', seed.source_id
from checklist_seed seed
join public.service_boards board on board.board_key = 'tubing'
join public.service_board_cards card
  on card.board_id = board.id
 and card.source_type = 'trello_tubing'
 and card.source_id = seed.card_source_id
on conflict (card_id, source_type, source_id) where source_type is not null and source_id is not null do update
set label = excluded.label,
    is_done = excluded.is_done,
    sort_order = excluded.sort_order;

commit;

select
  board.name,
  count(distinct lane.id) filter (where lane.active) as active_lanes,
  count(distinct card.id) filter (where card.archived_at is null) as active_cards,
  count(distinct item.id) as checklist_items
from public.service_boards board
left join public.service_board_columns lane on lane.board_id = board.id
left join public.service_board_cards card on card.board_id = board.id and card.source_type = 'trello_tubing'
left join public.service_board_card_checklist item on item.card_id = card.id and item.source_type = 'trello_tubing'
where board.board_key = 'tubing'
group by board.name;
