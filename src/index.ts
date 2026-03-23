import Fastify from "fastify";
import fastifySwagger from "@fastify/swagger";
import { z } from "zod";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from "fastify-type-provider-zod";
import fastifyCors from "@fastify/cors";
import fastifyApiReference from "@scalar/fastify-api-reference";

import { auth } from "./lib/auth.js";
import { CreateWorkoutPlan } from "./usecases/create-workout-plan.js";
import { fromNodeHeaders } from "better-auth/node";
import { NotFoundError } from "./errors/index.js";
import { WeekDay } from "./generated/prisma/client.js";

const app = Fastify({
  logger: true,
}).withTypeProvider<ZodTypeProvider>();

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

// Register CORS to allow requests from the frontend
await app.register(fastifyCors, {
  origin: [process.env.FRONTEND_URL || "http://localhost:3000"],
  credentials: true,
});

// Register Swagger for API documentation
await app.register(fastifySwagger, {
  openapi: {
    info: {
      title: "Bootcamp Treinos API",
      description: "API para o bootcamp de treinos do FSC",
      version: "1.0.0",
    },
    servers: [
      {
        description: "Localhost",
        url: "http://localhost:8081",
      },
    ],
  },
  transform: jsonSchemaTransform,
});

// Swagger UI for API documentation
await app.register(fastifyApiReference, {
  routePrefix: "/docs",
  configuration: {
    sources: [
      {
        title: "Bootcamp Treinos API",
        slug: "bootcamp-treinos-api",
        url: "/swagger.json",
      },
      {
        title: "Auth API",
        slug: "auth-api",
        url: "/api/auth/open-api/generate-schema",
      },
    ],
  },
});

app.route({
  method: "POST",
  url: "/workout-plans",
  schema: {
    tags: ["Workout Plan"],
    summary: "Create a workout plan",
    body: z.object({
      name: z.string(),
      workoutDays: z.array(
        z.object({
          weekDay: z.enum(WeekDay),
          name: z.string(),
          isRest: z.boolean(),
          coverImageUrl: z.url().optional(),
          estimatedDurationInSeconds: z.number(),
          exercises: z.array(
            z.object({
              order: z.number(),
              name: z.string(),
              sets: z.number(),
              reps: z.number(),
              restTimeInSeconds: z.number(),
            }),
          ),
        }),
      ),
    }),
    response: {
      201: z.object({
        id: z.string(),
        name: z.string(),
        workoutDays: z.array(
          z.object({
            name: z.string(),
            weekDay: z.enum(WeekDay),
            isRest: z.boolean(),
            coverImageUrl: z.url().optional(),
            estimatedDurationInSeconds: z.number(),
            exercises: z.array(
              z.object({
                order: z.number(),
                name: z.string(),
                sets: z.number(),
                reps: z.number(),
                restTimeInSeconds: z.number(),
              }),
            ),
          }),
        ),
      }),
      400: z.object({
        error: z.string(),
        code: z.string(),
      }),
      401: z.object({
        error: z.string(),
        code: z.string(),
      }),
      404: z.object({
        error: z.string(),
        code: z.string(),
      }),
      500: z.object({
        error: z.string(),
        code: z.string(),
      }),
    },
  },
  handler: async (request, reply) => {
    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });

      if (!session) {
        return reply.status(401).send({
          error: "Unauthorized",
          code: "UNAUTHORIZED",
        });
      }

      const createWorkoutPlan = new CreateWorkoutPlan();

      const result = await createWorkoutPlan.execute({
        userId: session.user.id,
        name: request.body.name,
        workoutDays: request.body.workoutDays,
      });

      return reply.status(201).send(result);
    } catch (error) {
      app.log.error(error);

      if (error instanceof NotFoundError) {
        return reply.status(404).send({
          error: error.message,
          code: "NOT_FOUND_ERROR",
        });
      }

      return reply.status(500).send({
        error: "Internal server error",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  },
});

// HELLO WORLD ENDPOINT
app.route({
  method: "GET",
  url: "/",
  handler: async (_, reply) => {
    return reply.send({ message: "Hello World" });
  },
  schema: {
    description: "Hello World endpoint",
    tags: ["hello"],
    response: {
      200: z.object({
        message: z.string(),
      }),
    },
  },
});

// Register authentication endpoint
app.route({
  method: ["GET", "POST"],
  url: "/api/auth/*",
  async handler(request, reply) {
    try {
      // Construct request URL
      const url = new URL(request.url, `http://${request.headers.host}`);

      // Convert Fastify headers to standard Headers object
      const headers = new Headers();
      Object.entries(request.headers).forEach(([key, value]) => {
        if (value) headers.append(key, value.toString());
      });
      // Create Fetch API-compatible request
      const req = new Request(url.toString(), {
        method: request.method,
        headers,
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      });
      // Process authentication request
      const response = await auth.handler(req);
      // Forward response to client
      reply.status(response.status);
      response.headers.forEach((value, key) => reply.header(key, value));
      reply.send(response.body ? await response.text() : null);
    } catch (error) {
      app.log.error(`Authentication Error: ${JSON.stringify(error)}`);
      reply.status(500).send({
        error: "Internal authentication error",
        code: "AUTH_FAILURE",
      });
    }
  },
});

await app.ready();

try {
  await app.listen({ port: Number(process.env.PORT) || 8081 });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
