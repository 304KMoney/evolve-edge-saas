#!/usr/bin/env node

const SERVER_NAME = "evolve-edge-apollo";
const SERVER_VERSION = "0.1.0";
const DEFAULT_PROTOCOL_VERSION = "2024-11-05";
const DEFAULT_APOLLO_API_BASE_URL = "https://api.apollo.io/api/v1";

const toolDefinitions = [
  {
    name: "apollo_search_people",
    description:
      "Search Apollo for net-new people for prospecting and enrichment. This endpoint does not consume Apollo credits, but it does require a master API key and does not reveal emails or phone numbers.",
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      type: "object",
      properties: {
        q_keywords: {
          type: "string",
          description: "Free-text query, often a company name, domain hint, or role clue."
        },
        organization_domains: {
          type: "array",
          items: { type: "string" },
          description: "Prefer this when you know the target company's domain."
        },
        organization_ids: {
          type: "array",
          items: { type: "string" }
        },
        person_titles: {
          type: "array",
          items: { type: "string" }
        },
        person_seniorities: {
          type: "array",
          items: { type: "string" }
        },
        person_locations: {
          type: "array",
          items: { type: "string" }
        },
        organization_locations: {
          type: "array",
          items: { type: "string" }
        },
        contact_email_status: {
          type: "array",
          items: { type: "string" }
        },
        include_similar_titles: {
          type: "boolean",
          default: true
        },
        page: {
          type: "integer",
          minimum: 1,
          default: 1
        },
        per_page: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 5
        }
      }
    }
  },
  {
    name: "apollo_search_organizations",
    description:
      "Search Apollo for organizations that match an ICP. This endpoint can consume Apollo credits, so use targeted filters.",
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      type: "object",
      properties: {
        organization_name: {
          type: "string"
        },
        organization_domains: {
          type: "array",
          items: { type: "string" }
        },
        organization_locations: {
          type: "array",
          items: { type: "string" }
        },
        organization_not_locations: {
          type: "array",
          items: { type: "string" }
        },
        organization_num_employees_ranges: {
          type: "array",
          items: { type: "string" }
        },
        currently_using_any_of_technology_uids: {
          type: "array",
          items: { type: "string" }
        },
        q_organization_keyword_tags: {
          type: "array",
          items: { type: "string" }
        },
        page: {
          type: "integer",
          minimum: 1,
          default: 1
        },
        per_page: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 10
        }
      }
    }
  },
  {
    name: "apollo_enrich_person",
    description:
      "Enrich a single person in Apollo using an email, LinkedIn URL, domain, or a name plus company context. This endpoint can consume Apollo credits.",
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string"
        },
        first_name: {
          type: "string"
        },
        last_name: {
          type: "string"
        },
        name: {
          type: "string"
        },
        organization_name: {
          type: "string"
        },
        domain: {
          type: "string"
        },
        linkedin_url: {
          type: "string"
        },
        person_id: {
          type: "string",
          description: "Apollo person ID from a prior search."
        }
      }
    }
  },
  {
    name: "apollo_enrich_organization",
    description:
      "Enrich a single organization by domain. This endpoint can consume Apollo credits.",
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Company domain without www."
        }
      },
      required: ["domain"]
    }
  }
];

function writeMessage(message) {
  const payload = JSON.stringify(message);
  const bytes = Buffer.byteLength(payload, "utf8");
  process.stdout.write(`Content-Length: ${bytes}\r\n\r\n${payload}`);
}

function writeError(id, code, message, data) {
  writeMessage({
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data })
    }
  });
}

function writeResult(id, result) {
  writeMessage({
    jsonrpc: "2.0",
    id,
    result
  });
}

function getApolloApiKey() {
  return process.env.APOLLO_API_KEY?.trim() ?? "";
}

function getApolloApiBaseUrl() {
  return (
    process.env.APOLLO_API_BASE_URL?.trim().replace(/\/+$/, "") ??
    DEFAULT_APOLLO_API_BASE_URL
  );
}

function ensureApolloConfig() {
  const apiKey = getApolloApiKey();
  const baseUrl = getApolloApiBaseUrl();

  if (!apiKey) {
    return {
      ok: false,
      error:
        "APOLLO_API_KEY is not set. Add it to your local environment before using the Apollo MCP server."
    };
  }

  return {
    ok: true,
    apiKey,
    baseUrl
  };
}

function appendArrayParams(url, key, values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      url.searchParams.append(key, value.trim());
    }
  }
}

function appendScalarParam(url, key, value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      url.searchParams.set(key, trimmed);
    }
    return;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    url.searchParams.set(key, String(value));
  }
}

async function apolloRequest({ path, method = "GET", params = {} }) {
  const config = ensureApolloConfig();
  if (!config.ok) {
    return {
      ok: false,
      status: 0,
      error: config.error
    };
  }

  const url = new URL(`${config.baseUrl}${path}`);

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      appendArrayParams(url, key, value);
    } else {
      appendScalarParam(url, key, value);
    }
  }

  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${config.apiKey}`
    }
  });

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
    url: url.toString()
  };
}

function pickDefinedEntries(input) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => {
      if (value === undefined || value === null) {
        return false;
      }
      if (typeof value === "string") {
        return value.trim().length > 0;
      }
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      return true;
    })
  );
}

function normalizeLocation(record) {
  const parts = [
    record.city,
    record.state,
    record.country,
    record.organization?.city,
    record.organization?.state,
    record.organization?.country
  ].filter((value, index, all) => typeof value === "string" && value.trim().length > 0 && all.indexOf(value) === index);

  return parts.length > 0 ? parts.join(", ") : null;
}

function normalizePeople(data) {
  const people = Array.isArray(data?.people)
    ? data.people
    : Array.isArray(data?.contacts)
      ? data.contacts
      : Array.isArray(data?.persons)
        ? data.persons
        : [];

  return people.map((person) => ({
    id: person.id ?? person.person_id ?? null,
    name:
      person.name ??
      ([person.first_name, person.last_name].filter(Boolean).join(" ") || null),
    title: person.title ?? person.job_title ?? null,
    linkedin_url: person.linkedin_url ?? null,
    organization_name:
      person.organization?.name ?? person.organization_name ?? person.company_name ?? null,
    organization_domain:
      person.organization?.website_url ??
      person.organization?.primary_domain ??
      person.organization?.domain ??
      null,
    email_status: person.email_status ?? null,
    location: normalizeLocation(person)
  }));
}

function normalizeOrganizations(data) {
  const organizations = Array.isArray(data?.organizations)
    ? data.organizations
    : Array.isArray(data?.accounts)
      ? data.accounts
      : Array.isArray(data?.companies)
        ? data.companies
        : [];

  return organizations.map((organization) => ({
    id: organization.id ?? organization.organization_id ?? null,
    name: organization.name ?? null,
    domain:
      organization.primary_domain ??
      organization.website_url ??
      organization.domain ??
      null,
    industry: organization.industry ?? null,
    estimated_num_employees:
      organization.estimated_num_employees ?? organization.employee_count ?? null,
    location: normalizeLocation(organization),
    linkedin_url: organization.linkedin_url ?? null
  }));
}

function normalizePersonMatch(data) {
  const person = data?.person ?? data?.contact ?? data ?? null;
  if (!person || typeof person !== "object") {
    return null;
  }

  return {
    id: person.id ?? person.person_id ?? null,
    name:
      person.name ??
      ([person.first_name, person.last_name].filter(Boolean).join(" ") || null),
    title: person.title ?? person.job_title ?? null,
    email: person.email ?? person.work_email ?? null,
    linkedin_url: person.linkedin_url ?? null,
    organization_name:
      person.organization?.name ?? person.organization_name ?? person.company_name ?? null,
    organization_domain:
      person.organization?.website_url ??
      person.organization?.primary_domain ??
      person.organization?.domain ??
      null,
    location: normalizeLocation(person)
  };
}

function normalizeOrganizationMatch(data) {
  const organization = data?.organization ?? data?.account ?? data ?? null;
  if (!organization || typeof organization !== "object") {
    return null;
  }

  return {
    id: organization.id ?? organization.organization_id ?? null,
    name: organization.name ?? null,
    domain:
      organization.primary_domain ??
      organization.website_url ??
      organization.domain ??
      null,
    industry: organization.industry ?? null,
    estimated_num_employees:
      organization.estimated_num_employees ?? organization.employee_count ?? null,
    founded_year: organization.founded_year ?? null,
    location: normalizeLocation(organization),
    linkedin_url: organization.linkedin_url ?? null
  };
}

function buildTextResult(title, payload) {
  return `${title}\n${JSON.stringify(payload, null, 2)}`;
}

function buildToolResponse({ title, payload, isError = false }) {
  return {
    content: [
      {
        type: "text",
        text: buildTextResult(title, payload)
      }
    ],
    structuredContent: payload,
    ...(isError ? { isError: true } : {})
  };
}

async function handleSearchPeople(args) {
  const params = pickDefinedEntries({
    q_keywords: args.q_keywords,
    "q_organization_domains_list[]": args.organization_domains,
    "organization_ids[]": args.organization_ids,
    "person_titles[]": args.person_titles,
    "person_seniorities[]": args.person_seniorities,
    "person_locations[]": args.person_locations,
    "organization_locations[]": args.organization_locations,
    "contact_email_status[]": args.contact_email_status,
    include_similar_titles:
      typeof args.include_similar_titles === "boolean" ? args.include_similar_titles : true,
    page: args.page ?? 1,
    per_page: args.per_page ?? 5
  });

  const response = await apolloRequest({
    path: "/mixed_people/api_search",
    method: "POST",
    params
  });

  if (!response.ok) {
    return buildToolResponse({
      title: "Apollo people search failed",
      payload: response,
      isError: true
    });
  }

  const payload = {
    endpoint: response.url,
    credit_behavior: "People API Search does not consume credits but requires a master API key.",
    results: normalizePeople(response.data),
    pagination: response.data?.pagination ?? null
  };

  return buildToolResponse({
    title: "Apollo people search results",
    payload
  });
}

async function handleSearchOrganizations(args) {
  const params = pickDefinedEntries({
    q_organization_name: args.organization_name,
    "q_organization_domains_list[]": args.organization_domains,
    "organization_locations[]": args.organization_locations,
    "organization_not_locations[]": args.organization_not_locations,
    "organization_num_employees_ranges[]": args.organization_num_employees_ranges,
    "currently_using_any_of_technology_uids[]": args.currently_using_any_of_technology_uids,
    "q_organization_keyword_tags[]": args.q_organization_keyword_tags,
    page: args.page ?? 1,
    per_page: args.per_page ?? 10
  });

  const response = await apolloRequest({
    path: "/mixed_companies/search",
    method: "POST",
    params
  });

  if (!response.ok) {
    return buildToolResponse({
      title: "Apollo organization search failed",
      payload: response,
      isError: true
    });
  }

  const payload = {
    endpoint: response.url,
    credit_behavior: "Organization Search can consume Apollo credits.",
    results: normalizeOrganizations(response.data),
    pagination: response.data?.pagination ?? null
  };

  return buildToolResponse({
    title: "Apollo organization search results",
    payload
  });
}

async function handleEnrichPerson(args) {
  const params = pickDefinedEntries({
    email: args.email,
    first_name: args.first_name,
    last_name: args.last_name,
    name: args.name,
    organization_name: args.organization_name,
    domain: args.domain,
    linkedin_url: args.linkedin_url,
    id: args.person_id
  });

  const response = await apolloRequest({
    path: "/people/match",
    method: "POST",
    params
  });

  if (!response.ok) {
    return buildToolResponse({
      title: "Apollo person enrichment failed",
      payload: response,
      isError: true
    });
  }

  const payload = {
    endpoint: response.url,
    credit_behavior: "People enrichment can consume Apollo credits.",
    person: normalizePersonMatch(response.data),
    raw_status: response.data?.status ?? null
  };

  return buildToolResponse({
    title: "Apollo person enrichment result",
    payload
  });
}

async function handleEnrichOrganization(args) {
  const response = await apolloRequest({
    path: "/organizations/enrich",
    method: "GET",
    params: {
      domain: args.domain
    }
  });

  if (!response.ok) {
    return buildToolResponse({
      title: "Apollo organization enrichment failed",
      payload: response,
      isError: true
    });
  }

  const payload = {
    endpoint: response.url,
    credit_behavior: "Organization enrichment can consume Apollo credits.",
    organization: normalizeOrganizationMatch(response.data)
  };

  return buildToolResponse({
    title: "Apollo organization enrichment result",
    payload
  });
}

async function handleToolCall(name, args) {
  switch (name) {
    case "apollo_search_people":
      return handleSearchPeople(args);
    case "apollo_search_organizations":
      return handleSearchOrganizations(args);
    case "apollo_enrich_person":
      return handleEnrichPerson(args);
    case "apollo_enrich_organization":
      return handleEnrichOrganization(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function handleRequest(message) {
  if (!message || typeof message !== "object") {
    return;
  }

  const { id, method, params } = message;

  if (typeof method !== "string") {
    if (id !== undefined) {
      writeError(id, -32600, "Invalid JSON-RPC request.");
    }
    return;
  }

  try {
    switch (method) {
      case "initialize": {
        const protocolVersion =
          typeof params?.protocolVersion === "string"
            ? params.protocolVersion
            : DEFAULT_PROTOCOL_VERSION;

        writeResult(id, {
          protocolVersion,
          capabilities: {
            tools: {
              listChanged: false
            }
          },
          serverInfo: {
            name: SERVER_NAME,
            version: SERVER_VERSION
          },
          instructions:
            "Use Apollo only for prospecting and enrichment. Do not treat Apollo output as canonical product, routing, or customer lifecycle state."
        });
        return;
      }
      case "notifications/initialized":
        return;
      case "ping":
        writeResult(id, {});
        return;
      case "tools/list":
        writeResult(id, {
          tools: toolDefinitions
        });
        return;
      case "tools/call": {
        if (!params || typeof params.name !== "string") {
          writeError(id, -32602, "tools/call requires a tool name.");
          return;
        }

        const result = await handleToolCall(params.name, params.arguments ?? {});
        writeResult(id, result);
        return;
      }
      default:
        if (id !== undefined) {
          writeError(id, -32601, `Unsupported method: ${method}`);
        }
    }
  } catch (error) {
    if (id !== undefined) {
      writeError(
        id,
        -32000,
        error instanceof Error ? error.message : "Unexpected Apollo MCP server error.",
        error instanceof Error ? { stack: error.stack } : undefined
      );
    }
  }
}

let inputBuffer = Buffer.alloc(0);
let dispatchQueue = Promise.resolve();

async function dispatchParsedMessage(message) {
  if (Array.isArray(message)) {
    for (const entry of message) {
      // eslint-disable-next-line no-await-in-loop
      await handleRequest(entry);
    }
    return;
  }

  await handleRequest(message);
}

function queueParsedMessage(message) {
  dispatchQueue = dispatchQueue
    .then(() => dispatchParsedMessage(message))
    .catch((error) => {
      writeError(
        null,
        -32000,
        error instanceof Error ? error.message : "Unexpected Apollo MCP server error.",
        error instanceof Error ? { stack: error.stack } : undefined
      );
    });
}

function processInputBuffer() {
  while (true) {
    const headerEnd = inputBuffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) {
      return;
    }

    const headerText = inputBuffer.subarray(0, headerEnd).toString("utf8");
    const contentLengthMatch = headerText.match(/Content-Length:\s*(\d+)/i);
    if (!contentLengthMatch) {
      writeError(null, -32600, "Missing Content-Length header.");
      inputBuffer = Buffer.alloc(0);
      return;
    }

    const contentLength = Number.parseInt(contentLengthMatch[1], 10);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + contentLength;

    if (inputBuffer.length < bodyEnd) {
      return;
    }

    const body = inputBuffer.subarray(bodyStart, bodyEnd).toString("utf8");
    inputBuffer = inputBuffer.subarray(bodyEnd);

    let message;
    try {
      message = JSON.parse(body);
    } catch (error) {
      writeError(
        null,
        -32700,
        "Failed to parse JSON-RPC message body.",
        error instanceof Error ? { message: error.message } : undefined
      );
      continue;
    }

    queueParsedMessage(message);
  }
}

process.stdin.on("data", (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  processInputBuffer();
});

process.stdin.resume();
