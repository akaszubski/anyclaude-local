import type { JSONSchema7 } from "json-schema";

/**
 * Helper function to resolve union types (oneOf, anyOf, allOf)
 * LMStudio doesn't support JSON Schema union types, so we need to resolve them
 * to a single, concrete schema.
 */
function resolveUnionType(schema: JSONSchema7): JSONSchema7 {
  // Handle oneOf: use the first non-null type
  if (schema.oneOf && Array.isArray(schema.oneOf)) {
    const firstSchema = schema.oneOf.find(
      (s) => typeof s === "object" && s.type !== "null"
    );
    if (firstSchema && typeof firstSchema === "object") {
      const resolved = { ...firstSchema } as JSONSchema7;
      // Remove the oneOf property
      const result = { ...schema, ...resolved };
      delete result.oneOf;
      return result;
    }
  }

  // Handle anyOf: use the first non-null type (similar to oneOf)
  if (schema.anyOf && Array.isArray(schema.anyOf)) {
    const firstSchema = schema.anyOf.find(
      (s) => typeof s === "object" && s.type !== "null"
    );
    if (firstSchema && typeof firstSchema === "object") {
      const resolved = { ...firstSchema } as JSONSchema7;
      const result = { ...schema, ...resolved };
      delete result.anyOf;
      return result;
    }
  }

  // Handle allOf: merge all schemas
  if (schema.allOf && Array.isArray(schema.allOf)) {
    const merged: JSONSchema7 = { ...schema };
    delete merged.allOf;

    for (const subSchema of schema.allOf) {
      if (typeof subSchema === "object") {
        // Merge properties
        if (subSchema.properties) {
          merged.properties = {
            ...merged.properties,
            ...subSchema.properties,
          };
        }

        // Merge required fields
        if (subSchema.required) {
          merged.required = [...(merged.required || []), ...subSchema.required];
        }

        // Merge type (prefer object type)
        if (subSchema.type && !merged.type) {
          merged.type = subSchema.type;
        }
      }
    }

    return merged;
  }

  // Handle multi-type arrays: type: ['string', 'number']
  if (Array.isArray(schema.type)) {
    // Use first non-null type
    const firstType = schema.type.find((t) => t !== "null");
    if (firstType) {
      return { ...schema, type: firstType as JSONSchema7["type"] };
    }
  }

  return schema;
}

export function providerizeSchema(
  provider: string,
  schema: JSONSchema7
): JSONSchema7 {
  // Handle primitive types or schemas without properties
  if (
    !schema ||
    typeof schema !== "object" ||
    schema.type !== "object" ||
    !schema.properties
  ) {
    return schema;
  }

  const processedProperties: Record<string, JSONSchema7> = {};

  // Recursively process each property
  for (const [key, property] of Object.entries(schema.properties)) {
    if (typeof property === "object" && property !== null) {
      let processedProperty = property as JSONSchema7;

      // Resolve union types for OpenAI (LMStudio uses OpenAI format)
      if (provider === "openai") {
        processedProperty = resolveUnionType(processedProperty);
      }

      // Remove uri format for OpenAI and Google
      if (
        (provider === "openai" || provider === "google") &&
        processedProperty.format === "uri"
      ) {
        processedProperty = { ...processedProperty };
        delete processedProperty.format;
      }

      if (processedProperty.type === "object") {
        // Recursively process nested objects
        processedProperties[key] = providerizeSchema(
          provider,
          processedProperty
        );
      } else if (
        processedProperty.type === "array" &&
        processedProperty.items
      ) {
        // Handle arrays with items
        const items = processedProperty.items;
        if (typeof items === "object" && !Array.isArray(items)) {
          // Resolve union types in array items
          let resolvedItems = items as JSONSchema7;
          if (provider === "openai") {
            resolvedItems = resolveUnionType(resolvedItems);
          }

          // Recursively process if items are objects
          if (resolvedItems.type === "object") {
            processedProperties[key] = {
              ...processedProperty,
              items: providerizeSchema(provider, resolvedItems),
            };
          } else {
            processedProperties[key] = {
              ...processedProperty,
              items: resolvedItems,
            };
          }
        } else {
          processedProperties[key] = processedProperty;
        }
      } else {
        processedProperties[key] = processedProperty;
      }
    } else {
      // Handle boolean properties (true/false schemas)
      processedProperties[key] = property as unknown as JSONSchema7;
    }
  }

  const result: JSONSchema7 = {
    ...schema,
    properties: processedProperties,
  };

  // Only add required properties for OpenAI
  if (provider === "openai") {
    // Preserve existing required fields if they exist, otherwise don't mark any as required
    // This prevents marking optional fields as required which causes OpenAI validation errors
    if (schema.required && Array.isArray(schema.required)) {
      result.required = schema.required;
    }
    // Only set additionalProperties to false if it's not already defined
    // This preserves the original schema's intent
    if (schema.additionalProperties === undefined) {
      result.additionalProperties = false;
    } else {
      result.additionalProperties = schema.additionalProperties;
    }
  }

  return result;
}
