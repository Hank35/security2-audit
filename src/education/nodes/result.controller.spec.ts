import { Test } from "@nestjs/testing";
import { Queries } from "../../neo4j/neo4j.queries";
import { Neo4jService } from "../../neo4j/neo4j.service";
import { ResultController } from "./result.controller";
import { v4 as generateUuid, version as uuidVersion, validate as uuidValidate } from 'uuid';
import * as request from 'supertest';

export function validUuidV4(uuid: string) {
  return uuidValidate(uuid) && uuidVersion(uuid) === 4;
}

describe('ResultController', () => {
  let resultController;
  let neo4jService;
  let app;

  beforeEach(async () => {
    const neo4jServiceMockProvider = {
      provide: Neo4jService,
      useFactory: () => ({execute: jest.fn()})
    }

    const moduleRef = await Test.createTestingModule({
      controllers: [ResultController],
      providers: [neo4jServiceMockProvider],
    })
    .compile();

    app = await moduleRef.createNestApplication().init();

    resultController = moduleRef.get<ResultController>(ResultController);
    neo4jService = moduleRef.get<Neo4jService>(Neo4jService);
  })

  describe('creating result node', () => {
    test('rejects with missing name', async () => {
      await request(app.getHttpServer())
        .post('/result')
        .send({})
        .expect(400)
        .then(response => {
          expect(response.body.message).toEqual(['name should not be empty', 'name must be a string']);
        });
    });

    test('rejects with empty name and description', async () => {
      await request(app.getHttpServer())
        .post('/result')
        .send({name: '', description: ''})
        .expect(400)
        .then(response => {
          expect(response.body.message).toEqual(['name should not be empty', 'description should not be empty']);
        });
    });

    test('rejects with name and description not a string', async () => {
      await request(app.getHttpServer())
        .post('/result')
        .send({name: 5, description: 5})
        .expect(400)
        .then(response => {
          expect(response.body.message).toEqual(['name must be a string', 'description must be a string']);
        });
    });

    test('ignores extraneous parameters in body', async () => {
      await request(app.getHttpServer())
        .post('/result')
        .send({name: 'name', extraneous: 'property'})
        .expect(201);

      expect(neo4jService.execute.mock.calls[0][1]).not.toHaveProperty('extraneous');
    });

    test('executes correct query with parameters', async () => {
      // act
      await resultController.createResult({fake: 'property'});
  
      // asserts
  
      // exactly 1 call to execute
      expect(neo4jService.execute).toBeCalledTimes(1);
      // first parameter is correct query
      expect(neo4jService.execute.mock.calls[0][0]).toEqual(Queries.createResult);
  
      const props = neo4jService.execute.mock.calls[0][1]
      // second parameter has props
      expect(props).toHaveProperty('props');
      // fake property is propagated
      expect(props.props).toHaveProperty('fake', 'property')
      // uuid is generated by controller
      expect(props.props).toHaveProperty('uuid')
      expect(validUuidV4(props.props.uuid)).toBe(true);
    });
  });

  describe('updating result node', () => {
    test('rejects an invalid uuid', async () => {
      await request(app.getHttpServer())
        .put('/result/not-a-uuid')
        .send({name: 'name'})
        .expect(400)
        .then(response => {
          expect(response.body.message).toBe('Validation failed (uuid v4 is expected)');
        })
    });

    test('rejects with empty name', async () => {
      await request(app.getHttpServer())
        .put(`/result/${generateUuid()}`)
        .send({name: ''})
        .expect(400)
        .then(response => {
          expect(response.body.message).toEqual(['name should not be empty']);
        });
    });
  
    test('rejects with name not a string', async () => {
      await request(app.getHttpServer())
        .put(`/result/${generateUuid()}`)
        .send({name: 5})
        .expect(400)
        .then(response => {
          expect(response.body.message).toEqual(['name must be a string']);
        });
    });
  
    test('ignores extraneous parameters in body', async () => {
      await request(app.getHttpServer())
        .put(`/result/${generateUuid()}`)
        .send({name: 'name', extraneous: 'property'})
        .expect(200);
  
      expect(neo4jService.execute.mock.calls[0][1]).toHaveProperty('props');
      expect(neo4jService.execute.mock.calls[0][1].props).not.toHaveProperty('extraneous');
    });
  
    test('executes correct query with parameters', async () => {
      // arrange
      const uuid = generateUuid();
  
      // act
      await resultController.updateResult(uuid, {fake: 'property'});
  
      // asserts
  
      // exactly 1 call to execute
      expect(neo4jService.execute).toBeCalledTimes(1);
      // first parameter is correct query
      expect(neo4jService.execute.mock.calls[0][0]).toEqual(Queries.updateResult);
  
      const props = neo4jService.execute.mock.calls[0][1]
      // second parameter has props
      expect(props).toHaveProperty('props');
      // fake property is propagated
      expect(props.props).toHaveProperty('fake', 'property')
      // check that correct uuid is passed
      expect(props).toHaveProperty('uuid')
      expect(props.uuid).toBe(uuid);
    });
  });

  describe('deleting result node', () => {
    test('rejects an invalid uuid', async () => {
      await request(app.getHttpServer())
        .delete('/result/not-a-uuid')
        .expect(400)
        .then(response => {
          expect(response.body.message).toBe('Validation failed (uuid v4 is expected)');
        })
    });
  
    test('executes correct query with parameters', async () => {
      // arrange
      const uuid = generateUuid();
  
      // act
      await resultController.deleteResult(uuid);
  
      // asserts
  
      // exactly 1 call to execute
      expect(neo4jService.execute).toBeCalledTimes(1);
      // first parameter is correct query
      expect(neo4jService.execute.mock.calls[0][0]).toEqual(Queries.deleteNode);
  
      const props = neo4jService.execute.mock.calls[0][1]
      // check that correct uuid is passed
      expect(props).toHaveProperty('uuid')
      expect(props.uuid).toBe(uuid);
    });
  });
})
