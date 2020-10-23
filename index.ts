import {
    FieldNode,
    GraphQLResolveInfo,
    valueFromASTUntyped
} from "graphql";
import {FindOptions, Includeable, Model, OrderItem} from "sequelize";
import {SelectionNode} from "graphql/language/ast";
import {WhereAttributeHash, WhereOptions} from "sequelize/types/lib/model";

export type SQLOrder = {
    col: string,
    dir: 'ASC' | 'DESC'
}

export type SQLQueryArgs = {
    where?: WhereAttributeHash;

    /**
     * Specifies an ordering. If a string is provided, it will be escaped. Using an array, you can provide
     * several columns / functions to order by. Each element can be further wrapped in a two-element array. The
     * first element is the column / function to order by, the second is the direction. For example:
     * `order: [['name', 'DESC']]`. In this way the column will be escaped, but the direction will not.
     */
    orderBy?: SQLOrder[];

    /**
     * Limit the results
     */
    limit?: number;

    /**
     * Skip the results;
     */
    offset?: number;
}

export const getSequelizeQuery = (args: SQLQueryArgs, info: GraphQLResolveInfo, parentModel: typeof Model): FindOptions => {

    const fields = getSelectedFields(info);
    const attributes = getRootFieldNames(info).filter((fieldName): boolean => {
        return fieldName in parentModel.rawAttributes;
    });
    const include: Includeable[] = getIncludes(fields, info, parentModel);

    return {
        where: args.where || undefined,
        include,
        attributes,
        limit: args.limit || 100,
        order: args.orderBy ? args.orderBy.map((order) => {
            return [order.col, order.dir];
        }) : []
    };
};

export const resolveFragments = (selections: SelectionNode[], info: GraphQLResolveInfo): FieldNode[] => {
    const fragments = info.fragments;

    selections.forEach((selection) => {
        if (selection.kind === 'FragmentSpread') {
            const fragment = fragments[selection.name.value];
            selections.splice(selections.indexOf(selection), 1);
            selections = [...selections, ...fragment.selectionSet.selections];
        }
    });
    return selections as FieldNode[];
};

export const getIncludes = (fields: ReadonlyArray<FieldNode>, info: GraphQLResolveInfo, parentModel: typeof Model): Includeable[] => {
    const nestedFields = fields.filter((field) => field.name.value in parentModel.associations);

    return nestedFields.map((field: FieldNode): Includeable => {
        const variables = info.variableValues;
        const selections = field.selectionSet ? resolveFragments(field.selectionSet.selections.slice(), info) : [];

        let model: typeof Model;
        const as = field.name.value;

        if (as in parentModel.associations) {
            model = parentModel.associations[as].target;
        } else {
            throw new Error(`Field ${parentModel.name}.${as} not supported`);
        }

        const attributes = getFieldNames((selections as FieldNode[]).filter((field) => !field.selectionSet))
            .filter(value => value in model.rawAttributes);

        if (model.primaryKeyAttribute && !attributes.includes(model.primaryKeyAttribute)) {
            attributes.unshift(model.primaryKeyAttribute);
        }

        let required = false;
        let where: WhereOptions | undefined;
        let limit: number | undefined;
        let separate: boolean = false;
        let order: OrderItem[] | undefined;

        if (field.arguments) {
            const args: any = {};
            field.arguments.forEach(argument => {
                if (argument.value.kind === 'Variable') {
                    args[argument.name.value] = variables[argument.value.name.value];
                } else {
                    args[argument.name.value] = valueFromASTUntyped(argument.value);
                }
            });

            if ('required' in args) {
                required = args.required;
            }
            if ('where' in args) {
                where = args.where;
            }
            if ('orderBy' in args) {
                order = args.orderBy.map((order: SQLOrder) => {
                    return [order.col, order.dir];
                });
                separate = true;
            }
            if ('limit' in args && args.limit) {
                limit = args.limit;
                separate = true;
            }
        }

        return {
            model,
            where,
            order,
            limit,
            separate,
            as,
            attributes: selections.length > 0 ? attributes : undefined,
            required,
            include: getIncludes(selections as ReadonlyArray<FieldNode>, info, model)
        };
    });
};

export const getSelectedFields = (info: GraphQLResolveInfo): FieldNode[] => {
    if (info.fieldNodes.length === 0 || !info.fieldNodes[0].selectionSet) {
        return [];
    }

    const fields = resolveFragments(info.fieldNodes[0].selectionSet.selections.slice(), info) as FieldNode[];
    return fields.filter((field) => field.name.value !== "__typename");
};

const getFieldNames = (fields: ReadonlyArray<FieldNode>) => fields.map((fieldSelection: FieldNode) => fieldSelection.name.value);

export const getRootFields = (info: GraphQLResolveInfo): FieldNode[] => {
    return getSelectedFields(info).filter((field) => !field.selectionSet);
};

export const getRootFieldNames = (info: GraphQLResolveInfo): string[] => getFieldNames(getRootFields(info));
