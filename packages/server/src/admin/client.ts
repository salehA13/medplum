// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, singularize } from '@medplum/core';
import type {
  AccessPolicy,
  ClientApplication,
  IdentityProvider,
  Project,
  ProjectMembership,
  Reference,
} from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { body } from 'express-validator';
import { getAuthenticatedContext } from '../context';
import type { SystemRepository } from '../fhir/repo';
import { generateSecret } from '../oauth/keys';
import { makeValidationMiddleware } from '../util/validator';

export const createClientValidator = makeValidationMiddleware([
  body('name').notEmpty().withMessage('Client name is required'),
]);

export async function createClientHandler(req: Request, res: Response): Promise<void> {
  let project: Project;
  const ctx = getAuthenticatedContext();
  const { project: localsProject, systemRepo } = ctx;
  if (localsProject.superAdmin) {
    project = { resourceType: 'Project', id: singularize(req.params.projectId) };
  } else {
    project = localsProject;
  }

  const client = await createClient(systemRepo, {
    ...req.body,
    project,
  });

  res.status(201).json(client);
}

export interface CreateClientRequest {
  readonly project: Project;
  readonly name: string;
  readonly description?: string;
  readonly redirectUris?: string[];
  readonly accessPolicy?: Reference<AccessPolicy>;
  readonly identityProvider?: IdentityProvider;
  readonly accessTokenLifetime?: string;
  readonly refreshTokenLifetime?: string;

  /** @deprecated Use redirectUris instead */
  readonly redirectUri?: string;
}

export async function createClient(
  systemRepo: SystemRepository,
  request: CreateClientRequest
): Promise<WithId<ClientApplication>> {
  const client = await systemRepo.createResource<ClientApplication>({
    meta: {
      project: request.project.id,
    },
    resourceType: 'ClientApplication',
    name: request.name,
    secret: generateSecret(32),
    description: request.description,
    redirectUri: request.redirectUri,
    redirectUris: request.redirectUris,
    identityProvider: request.identityProvider,
    accessTokenLifetime: request.accessTokenLifetime,
    refreshTokenLifetime: request.refreshTokenLifetime,
  });

  await systemRepo.createResource<ProjectMembership>({
    meta: {
      project: request.project.id,
    },
    resourceType: 'ProjectMembership',
    project: createReference(request.project),
    user: createReference(client),
    profile: createReference(client),
    accessPolicy: request.accessPolicy,
  });

  return client;
}
