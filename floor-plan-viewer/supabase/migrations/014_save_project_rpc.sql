-- 014_save_project_rpc.sql
-- Create an atomic RPC function to save project state, avoiding partial corruptions from edge functions.

create or replace function public.save_project_transaction(
  p_project_id uuid,
  p_rooms jsonb,
  p_structural jsonb,
  p_furniture jsonb,
  p_events jsonb,
  p_snapshots jsonb,
  p_meta jsonb,
  p_rfq jsonb,
  p_status text
)
returns void as $$
declare
  r record;
  s record;
  f record;
  e record;
  sn record;
begin
  -- 1. Update project metadata
  update public.projects
  set 
    meta = p_meta,
    rfq = p_rfq,
    status = coalesce(p_status, status),
    updated_at = now()
  where id = p_project_id;

  -- 2. Rooms
  delete from public.rooms where project_id = p_project_id;
  if jsonb_array_length(p_rooms) > 0 then
    for r in select * from jsonb_to_recordset(p_rooms) as x(
      id text,
      polygon jsonb,
      type text,
      name text,
      label_point jsonb,
      dimensions_text text,
      area_sq_ft numeric
    ) loop
      insert into public.rooms(project_id, id, polygon, type, name, label_point, dimensions_text, area_sq_ft)
      values (p_project_id, r.id, r.polygon, r.type, r.name, r.label_point, r.dimensions_text, r.area_sq_ft);
    end loop;
  end if;

  -- 3. Structural Elements
  delete from public.structural_elements where project_id = p_project_id;
  if jsonb_array_length(p_structural) > 0 then
    for s in select * from jsonb_to_recordset(p_structural) as x(
      id text,
      type text,
      x numeric,
      y numeric,
      rotation_deg numeric,
      width numeric,
      depth numeric
    ) loop
      insert into public.structural_elements(project_id, id, type, x, y, rotation_deg, width, depth)
      values (p_project_id, s.id, s.type, s.x, s.y, s.rotation_deg, s.width, s.depth);
    end loop;
  end if;

  -- 4. Furniture
  delete from public.placed_furniture where project_id = p_project_id;
  if jsonb_array_length(p_furniture) > 0 then
    for f in select * from jsonb_to_recordset(p_furniture) as x(
      id text,
      catalog_id text,
      product_code text,
      room_id text,
      room_client_id text,
      x numeric,
      y numeric,
      z numeric,
      rotation_deg numeric,
      stage_source text,
      placement_source text,
      category text,
      catalog_width_mm numeric,
      catalog_depth_mm numeric,
      color_variant text,
      vaastu_adjusted boolean
    ) loop
      insert into public.placed_furniture(
        project_id, id, catalog_id, product_code, room_id, room_client_id, x, y, z, rotation_deg, 
        stage_source, placement_source, category, catalog_width_mm, catalog_depth_mm, color_variant, vaastu_adjusted
      ) values (
        p_project_id, f.id, f.catalog_id, f.product_code, f.room_id, f.room_client_id, f.x, f.y, f.z, f.rotation_deg,
        f.stage_source, f.placement_source, f.category, f.catalog_width_mm, f.catalog_depth_mm, f.color_variant, f.vaastu_adjusted
      );
    end loop;
  end if;

  -- 5. Append-only Events
  if jsonb_array_length(p_events) > 0 then
    for e in select * from jsonb_to_recordset(p_events) as x(
      tenant_id text,
      event_type text,
      payload jsonb
    ) loop
      insert into public.plan_events(project_id, tenant_id, event_type, payload)
      values (p_project_id, e.tenant_id, e.event_type, e.payload);
    end loop;
  end if;

  -- 6. Recommendation Snapshots
  if jsonb_array_length(p_snapshots) > 0 then
    for sn in select * from jsonb_to_recordset(p_snapshots) as x(
      tenant_id text,
      room_client_id text,
      room_type text,
      room_area_sqm numeric,
      room_aspect_ratio numeric,
      sku_combo text[],
      placement_mix jsonb,
      vaastu_enabled boolean,
      rfq_sent boolean,
      converted boolean
    ) loop
      insert into public.layout_snapshots(
        project_id, tenant_id, room_client_id, room_type, room_area_sqm, room_aspect_ratio, 
        sku_combo, placement_mix, vaastu_enabled, rfq_sent, converted
      ) values (
        p_project_id, sn.tenant_id, sn.room_client_id, sn.room_type, sn.room_area_sqm, sn.aspect_ratio,
        sn.sku_combo, sn.placement_mix, sn.vaastu_enabled, sn.rfq_sent, sn.converted
      );
    end loop;
  end if;

end;
$$ language plpgsql;
