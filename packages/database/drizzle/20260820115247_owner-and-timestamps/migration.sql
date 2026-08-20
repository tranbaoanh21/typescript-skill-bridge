CREATE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER projects_set_updated_at
BEFORE UPDATE ON projects
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER project_applications_set_updated_at
BEFORE UPDATE ON project_applications
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE FUNCTION add_project_owner_membership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO project_members (project_id, user_id, project_role)
  VALUES (NEW.id, NEW.owner_id, 'OWNER');
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER projects_add_owner_membership
AFTER INSERT ON projects
FOR EACH ROW EXECUTE FUNCTION add_project_owner_membership();
--> statement-breakpoint
CREATE FUNCTION enforce_project_owner_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.owner_id <> OLD.owner_id THEN
    RAISE EXCEPTION 'project owner cannot be changed directly'
      USING ERRCODE = '23514', CONSTRAINT = 'projects_owner_immutable';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER projects_enforce_owner_immutable
BEFORE UPDATE OF owner_id ON projects
FOR EACH ROW EXECUTE FUNCTION enforce_project_owner_immutable();
--> statement-breakpoint
CREATE FUNCTION enforce_project_owner_membership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.project_role = 'OWNER' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM projects
      WHERE projects.id = NEW.project_id
        AND projects.owner_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'OWNER membership must belong to the project owner'
        USING ERRCODE = '23514', CONSTRAINT = 'project_members_owner_matches_project';
    END IF;
  END IF;

  IF TG_OP IN ('DELETE', 'UPDATE') AND OLD.project_role = 'OWNER' THEN
    IF EXISTS (
      SELECT 1
      FROM projects
      WHERE projects.id = OLD.project_id
        AND projects.owner_id = OLD.user_id
    ) AND (
      TG_OP = 'DELETE'
      OR NEW.project_id <> OLD.project_id
      OR NEW.user_id <> OLD.user_id
      OR NEW.project_role <> 'OWNER'
    ) THEN
      RAISE EXCEPTION 'project owner membership cannot be removed or demoted'
        USING ERRCODE = '23514', CONSTRAINT = 'project_members_owner_required';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER project_members_enforce_owner
BEFORE INSERT OR UPDATE OR DELETE ON project_members
FOR EACH ROW EXECUTE FUNCTION enforce_project_owner_membership();
