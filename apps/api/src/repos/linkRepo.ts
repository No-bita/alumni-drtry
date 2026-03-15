import type { DbExecutor } from "../db/types.js";

interface LinkRow {
  id: string;
  person_id: string;
  platform: string;
  url: string;
  label: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ProfileLinkView {
  id: string;
  platform: string;
  url: string;
  label: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProfileLinkInput {
  personId: string;
  platform: string;
  url: string;
  label: string | null;
}

export interface UpdateProfileLinkInput extends CreateProfileLinkInput {
  linkId: string;
}

function mapLink(row: LinkRow): ProfileLinkView {
  return {
    id: row.id,
    platform: row.platform,
    url: row.url,
    label: row.label,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class LinkRepo {
  constructor(private readonly db: DbExecutor) {}

  async listByPerson(personId: string): Promise<ProfileLinkView[]> {
    const result = await this.db.query<LinkRow>(
      `
      SELECT id, person_id, platform, url, label, created_at, updated_at
      FROM profile_links
      WHERE person_id = $1
      ORDER BY created_at DESC
      `,
      [personId]
    );
    return result.rows.map(mapLink);
  }

  async findByIdAndPerson(linkId: string, personId: string): Promise<ProfileLinkView | null> {
    const result = await this.db.query<LinkRow>(
      `
      SELECT id, person_id, platform, url, label, created_at, updated_at
      FROM profile_links
      WHERE id = $1
        AND person_id = $2
      LIMIT 1
      `,
      [linkId, personId]
    );
    const row = result.rows[0];
    return row ? mapLink(row) : null;
  }

  async create(input: CreateProfileLinkInput): Promise<ProfileLinkView> {
    const result = await this.db.query<LinkRow>(
      `
      INSERT INTO profile_links (person_id, platform, url, label)
      VALUES ($1, $2, $3, $4)
      RETURNING id, person_id, platform, url, label, created_at, updated_at
      `,
      [input.personId, input.platform, input.url, input.label]
    );
    return mapLink(result.rows[0]!);
  }

  async update(input: UpdateProfileLinkInput): Promise<ProfileLinkView> {
    const result = await this.db.query<LinkRow>(
      `
      UPDATE profile_links
      SET
        platform = $3,
        url = $4,
        label = $5
      WHERE id = $1
        AND person_id = $2
      RETURNING id, person_id, platform, url, label, created_at, updated_at
      `,
      [input.linkId, input.personId, input.platform, input.url, input.label]
    );
    return mapLink(result.rows[0]!);
  }

  async deleteByIdAndPerson(linkId: string, personId: string): Promise<boolean> {
    const result = await this.db.query(
      `
      DELETE FROM profile_links
      WHERE id = $1
        AND person_id = $2
      `,
      [linkId, personId]
    );
    return (result.rowCount ?? 0) > 0;
  }
}

