import Fastify from "fastify";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import { z } from "zod";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from "fastify-type-provider-zod";

const app = Fastify({
  logger: true,
});

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

await app.register(fastifySwagger, {
  openapi: {
    info: {
      title: "Bootcamp Fit AI API",
      description: "API para o Fit AI Bootcamp",
      version: "1.0.0",
    },
    servers: [
      {
        description: "Local server",
        url: "http://localhost:8081",
      },
    ],
  },
  transform: jsonSchemaTransform,
});

await app.register(fastifySwaggerUi, {
  routePrefix: "/docs",
});

app.withTypeProvider<ZodTypeProvider>().route({
  method: "GET",
  url: "/",
  handler: () => {
    return { message: "Hello World!" };
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

try {
  await app.listen({ port: Number(process.env.PORT) || 8081 });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
