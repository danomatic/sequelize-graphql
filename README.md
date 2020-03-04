# Sequelize GraphQL

## Example

### SQL Schema
```mysql
CREATE TABLE `person`
(
  `id`              int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name`            varchar(255)   NOT NULL DEFAULT '',
  `best_friend_id`  varchar(255)   NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  CONSTRAINT `best_friend_fk`
    FOREIGN KEY (`best_friend_id`)
    REFERENCES `person` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB;
```

### GraphQL Schema
```graphql
enum OrderDirection {
  ASC
  DESC
}

input ColumnOrder {
  col: String,
  dir: OrderDirection
}

type Person {
  id: Int
  name: String
  bestFriendId: Int
  bestFriend: Person
}

type Query {
  people(where: JSON, orderBy: [ColumnOrder], limit: Int, offset: Int): [Person]
}
```

### Sequelize Model
```typescript
import {
  Model,
  Association,
  DataTypes,
  Sequelize
} from "sequelize";

export class Person extends Model {
  public id!: number;
  public name!: string;
  public bestFriendId!: number;
  public readonly bestFriend!: Person;

  public static associations: {
    bestFriend: Association<Person, Person>;
  };
}

export default (sequelize: Sequelize) => {
  Person.init({
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    name: DataTypes.STRING(255),
    bestFriendId: DataTypes.INTEGER.UNSIGNED
  }, {
    underscored: true,
    tableName: 'person',
    sequelize: sequelize
  });

  return Person;
};
```

### Resolver
```typescript
const resolvers: IResolvers = {
  Query: {
    people: (source, args, context: GraphQLContext, info): Person[] => {
      return context.db.Person.findAll(getSequelizeQuery(args, info, context.db.Person));
    }
  }
};
```

### Query
```graphql
query {
  people {
    id
    name
    bestFriend {
      id
      name
      bestFriend {
        id
        name
      }
    }
  }
}
```